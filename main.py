from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from datetime import datetime, timedelta
import random
import sqlite3

app = FastAPI(title="Codeforces Training Engine API", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
#         SQLITE DATABASE SETUP
# ==========================================
DB_FILE = "codeforces_hub.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS blogs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, author TEXT, content TEXT, publish_date TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS match_history (id INTEGER PRIMARY KEY AUTOINCREMENT, player1 TEXT, player2 TEXT, winner TEXT, score1 INTEGER, score2 INTEGER, match_date TEXT)''')
    conn.commit()
    conn.close()

init_db()

class BlogPostModel(BaseModel):
    title: str
    author: str
    content: str

class MatchModel(BaseModel):
    player1: str
    player2: str
    score1: int
    score2: int

# ==========================================
#               HELPERS
# ==========================================
def fetch_submissions(handle: str, count: int = 10000): # 10,000 for lifetime stats
    url = f"https://codeforces.com/api/user.status?handle={handle}&from=1&count={count}" 
    response = requests.get(url)
    return response.json() if response.status_code == 200 else None

def fetch_global_problemset():
    url = "https://codeforces.com/api/problemset.problems"
    response = requests.get(url)
    return response.json() if response.status_code == 200 else None

# ==========================================
#               ENDPOINTS
# ==========================================
@app.get("/api/v1/blogs")
def get_blogs(): 
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, author, content, publish_date FROM blogs ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "title": r[1], "author": r[2], "content": r[3], "date": r[4]} for r in rows]

@app.post("/api/v1/blogs")
def create_blog(post: BlogPostModel):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO blogs (title, author, content, publish_date) VALUES (?, ?, ?, ?)", (post.title, post.author, post.content, datetime.now().strftime("%Y-%m-%d")))
    conn.commit()
    conn.close()
    return {"status": "Success"}

@app.get("/api/v1/leaderboard")
def get_rolling_leaderboard(handles: str):
    handle_list = [h.strip() for h in handles.split(",") if h.strip()]
    leaderboard_data = []
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    for handle in handle_list:
        data = fetch_submissions(handle, count=500)
        if not data or data.get('status') != 'OK': continue
        solved_in_past_week = set()
        for sub in data['result']:
            if sub.get('verdict') == 'OK' and datetime.utcfromtimestamp(sub['creationTimeSeconds']) >= seven_days_ago:
                solved_in_past_week.add(sub.get('problem', {}).get('name'))
        leaderboard_data.append({"handle": handle, "solved_past_week": len(solved_in_past_week)})
    return {"leaderboard": sorted(leaderboard_data, key=lambda x: x['solved_past_week'], reverse=True)}

@app.get("/api/v1/feed")
def get_live_feed(handles: str):
    handle_list = [h.strip() for h in handles.split(",") if h.strip()]
    feed_events = []
    for handle in handle_list:
        data = fetch_submissions(handle, count=30)
        if not data or data.get('status') != 'OK': continue
        for sub in data['result']:
            if sub.get('verdict') == 'OK':
                prob = sub.get('problem', {})
                feed_events.append({
                    "handle": handle,
                    "problem_name": prob.get('name'),
                    "rating": prob.get('rating', 'Unrated'),
                    "timestamp": sub.get('creationTimeSeconds'),
                    "url": f"https://codeforces.com/contest/{prob.get('contestId')}/problem/{prob.get('index')}"
                })
    feed_events.sort(key=lambda x: x['timestamp'], reverse=True)
    return {"feed": feed_events[:20]}

@app.get("/api/v1/upsolve/{handle}")
def generate_upsolve_plan(handle: str, rating_min: int = 1400, rating_max: int = 1600, tag: str = "auto"):
    sub_data = fetch_submissions(handle, count=1000)
    global_problems = fetch_global_problemset()
    if not sub_data or sub_data.get('status') != 'OK' or not global_problems: raise HTTPException(status_code=404, detail="Data fetch failed")
    
    solved_set = {s.get('problem', {}).get('name') for s in sub_data['result'] if s.get('verdict') == 'OK'}
    
    target_tag = tag
    if tag == "auto":
        weak_tags = {}
        for sub in sub_data['result']:
            if sub.get('verdict') != 'OK':
                for t in sub.get('problem', {}).get('tags', []): weak_tags[t] = weak_tags.get(t, 0) + 1
        sorted_tags = sorted(weak_tags.items(), key=lambda item: item[1], reverse=True)
        target_tag = sorted_tags[0][0] if sorted_tags else "dp"
    
    recommendations = []
    for problem in global_problems['result']['problems']:
        prob_rating = problem.get('rating', 0)
        if rating_min <= prob_rating <= rating_max and target_tag in problem.get('tags', []) and problem['name'] not in solved_set:
            recommendations.append({
                "id": f"{problem.get('contestId', '')}{problem.get('index', '')}",
                "name": problem['name'], "rating": prob_rating, "tag": target_tag,
                "url": f"https://codeforces.com/contest/{problem['contestId']}/problem/{problem['index']}"
            })
            if len(recommendations) == 5: break
            
    return {"player_handle": handle, "critical_weakness": target_tag, "rating_range": f"{rating_min}-{rating_max}", "recommended_upsolves": recommendations}

@app.get("/api/v1/mashup/{handle}")
def create_custom_contest(handle: str, tags: str = "dp", rating_min: int = 1400, rating_max: int = 1600, count: int = 4, duration: int = 120):
    s_data, g_probs = fetch_submissions(handle, count=2000), fetch_global_problemset()
    solved = {s.get('problem', {}).get('name') for s in s_data['result'] if s.get('verdict') == 'OK'} if s_data else set()
    tag_list = [t.strip() for t in tags.split(',')]
    valid = []
    
    for p in g_probs['result']['problems'] if g_probs else []:
        p_rating = p.get('rating', 0)
        if rating_min <= p_rating <= rating_max and p['name'] not in solved:
            if "all" in tag_list or any(t in p.get('tags', []) for t in tag_list):
                valid.append({"problem_name": p['name'], "rating": p_rating, "tags": p.get('tags', []), "url": f"https://codeforces.com/contest/{p['contestId']}/problem/{p['index']}"})
                
    sel = random.sample(valid, min(count, len(valid)))
    return {"handle": handle, "duration_minutes": duration, "contest": sel}

@app.get("/api/v1/predict/{handle}")
def predict_rating(handle: str):
    url = f"https://codeforces.com/api/user.rating?handle={handle}"
    response = requests.get(url)
    if response.status_code != 200:
        return {"handle": handle, "current_rating": 0, "predicted_rating": 0, "delta": 0, "history_chart": []}
        
    data = response.json()
    if data['status'] != 'OK' or not data['result']:
        return {"handle": handle, "current_rating": 0, "predicted_rating": 0, "delta": 0, "history_chart": []}

    history = data['result']
    recent = history[-10:] if len(history) > 10 else history
    n = len(recent)
    
    if n < 2:
        pred = history[-1]['newRating'] if n == 1 else 1500
        return {"handle": handle, "current_rating": pred, "predicted_rating": pred, "delta": 0, "history_chart": []}

    sum_x = sum(range(n))
    sum_y = sum(c['newRating'] for c in recent)
    sum_x_sq = sum(x**2 for x in range(n))
    sum_xy = sum(x * c['newRating'] for x, c in enumerate(recent))

    denominator = (n * sum_x_sq - sum_x**2)
    m = (n * sum_xy - sum_x * sum_y) / denominator if denominator != 0 else 0
    
    current_rating = history[-1]['newRating']
    predicted_rating = int(current_rating + m) 

    chart_data = [{"contest": f"C{i+1}", "rating": c['newRating']} for i, c in enumerate(history[-20:])]

    return {
        "handle": handle,
        "current_rating": current_rating,
        "predicted_rating": predicted_rating,
        "delta": predicted_rating - current_rating,
        "history_chart": chart_data
    }

@app.get("/api/v1/dashboard/{handle}")
def get_advanced_analytics(handle: str):
    s_res = fetch_submissions(handle, count=10000) 
    if not s_res or s_res.get('status') != 'OK': raise HTTPException(status_code=404, detail="Failed to fetch user submissions")
    r_counts, tag_counts, date_counts, tag_problems = {}, {}, {}, {}
    date_solves = set()
    today_ist = (datetime.utcnow() + timedelta(hours=5, minutes=30)).date()
    
    for sub in s_res['result']:
        creation_time_ist = (datetime.utcfromtimestamp(sub['creationTimeSeconds']) + timedelta(hours=5, minutes=30)).date()
        delta_days = (today_ist - creation_time_ist).days
        if 0 <= delta_days < 365: date_counts[delta_days] = date_counts.get(delta_days, 0) + 1 
        
        if sub.get('verdict') == 'OK':
            prob_name = sub.get('problem', {}).get('name')
            if sub.get('problem', {}).get('rating'): r_counts[sub['problem']['rating']] = r_counts.get(sub['problem']['rating'], 0) + 1
            for tag in sub.get('problem', {}).get('tags', []): 
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
                if tag not in tag_problems: tag_problems[tag] = []
                if prob_name not in tag_problems[tag]: tag_problems[tag].append(prob_name)
            date_solves.add(creation_time_ist)
    
    streak = 0
    yesterday_ist = today_ist - timedelta(days=1)
    if today_ist in date_solves: check_date = today_ist
    elif yesterday_ist in date_solves: check_date = yesterday_ist
    else: check_date = None
    if check_date:
        while check_date in date_solves:
            streak += 1
            check_date -= timedelta(days=1)
            
    heatmap_data = [ (0 if c == 0 else (1 if c == 1 else (2 if c <= 3 else (3 if c <= 5 else 4)))) for c in [date_counts.get(i, 0) for i in range(364, -1, -1)] ] 
    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:6]
    max_val = sorted_tags[0][1] if sorted_tags else 100
    
    return {
        "handle": handle, "current_streak": streak, "heatmap_data": heatmap_data, "tag_drilldown": tag_problems,
        "radar_data": [{"subject": k.title(), "A": v, "fullMark": max_val + (10 - max_val % 10)} for k, v in sorted_tags],
        "rating_distribution": [{"rating": str(k), "solved": v} for k, v in sorted(r_counts.items())]
    }

@app.get("/api/v1/compare")
def compare_rivals(handle1: str, handle2: str):
    d1, d2 = fetch_submissions(handle1, count=1000), fetch_submissions(handle2, count=1000)
    w1, w2 = {}, {}
    for s in d1['result'] if d1 else []:
        if s.get('verdict') != 'OK':
            for t in s.get('problem', {}).get('tags', []): w1[t] = w1.get(t, 0) + 1
    for s in d2['result'] if d2 else []:
        if s.get('verdict') != 'OK':
            for t in s.get('problem', {}).get('tags', []): w2[t] = w2.get(t, 0) + 1
            
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT player1, player2, winner, score1, score2, match_date 
        FROM match_history 
        WHERE (player1=? AND player2=?) OR (player1=? AND player2=?) 
        ORDER BY id DESC
    """, (handle1, handle2, handle2, handle1))
    history_rows = cursor.fetchall()
    conn.close()
    
    history_list = [{"p1": r[0], "p2": r[1], "winner": r[2], "s1": r[3], "s2": r[4], "date": r[5]} for r in history_rows]

    return {
        "player1": {"handle": handle1, "top_weaknesses": [{"topic": k, "failures": v} for k, v in sorted(w1.items(), key=lambda x: x[1], reverse=True)[:5]]}, 
        "player2": {"handle": handle2, "top_weaknesses": [{"topic": k, "failures": v} for k, v in sorted(w2.items(), key=lambda x: x[1], reverse=True)[:5]]},
        "match_history": history_list
    }

@app.post("/api/v1/rivalry/match")
def record_match(match: MatchModel):
    if match.score1 > match.score2: winner = match.player1
    elif match.score2 > match.score1: winner = match.player2
    else: winner = "Draw"
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO match_history (player1, player2, winner, score1, score2, match_date) VALUES (?, ?, ?, ?, ?, ?)", 
        (match.player1, match.player2, winner, match.score1, match.score2, datetime.now().strftime("%Y-%m-%d"))
    )
    conn.commit()
    conn.close()
    return {"status": "Match Saved", "winner": winner}
import os
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)