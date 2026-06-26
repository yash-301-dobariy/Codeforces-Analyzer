import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, ReferenceLine
} from 'recharts';
import './index.css';

const AVAILABLE_TAGS = ['dp', 'math', 'greedy', 'graphs', 'binary search', 'data structures', 'strings', 'geometry'];
// Updated to 365 days for the 1-Year Heatmap
const MOCK_HEATMAP = Array.from({ length: 365 }, () => Math.floor(Math.random() * 5));
const MOCK_RATING_DATA = [
  { rating: '800', solved: 45 }, { rating: '900', solved: 30 }, { rating: '1000', solved: 50 },
  { rating: '1100', solved: 70 }, { rating: '1200', solved: 110 }, { rating: '1300', solved: 85 },
  { rating: '1400', solved: 40 }, { rating: '1500', solved: 20 }, { rating: '1600', solved: 5 }
];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [handle, setHandle] = useState('tanminati');
  const [rivalHandle, setRivalHandle] = useState('jiangly');
  const [isDarkMode, setIsDarkMode] = useState(true); 
  
  const [ratingMin, setRatingMin] = useState(1400);
  const [ratingMax, setRatingMax] = useState(1600);
  const [trainingTag, setTrainingTag] = useState('auto'); 
  const [mashupTags, setMashupTags] = useState(['dp', 'greedy']); 
  const [mashupDuration, setMashupDuration] = useState(120); 
  const [contestCount, setContestCount] = useState(4);
  const [leaderboardInput, setLeaderboardInput] = useState('tanminati, jiangly');
  
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [blogTitle, setBlogTitle] = useState('');
  const [blogContent, setBlogContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [contestData, setContestData] = useState(null);

  const [contestStatus, setContestStatus] = useState('idle'); 
  const [timeLeft, setTimeLeft] = useState(0);
  const [endTime, setEndTime] = useState(null); 
  const [expandedTags, setExpandedTags] = useState({});

  const [matchScore1, setMatchScore1] = useState('');
  const [matchScore2, setMatchScore2] = useState('');
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://codeforces-analyzer-2.onrender.com';
  useEffect(() => { if (activeTab === 'blogs' && blogs.length === 0) fetchBlogs(); }, [activeTab]);
  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  useEffect(() => {
    let timer = null;
    if (contestStatus === 'active' && endTime) {
      timer = setInterval(() => {
        const remainingSeconds = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        setTimeLeft(remainingSeconds);
        if (remainingSeconds <= 0) { setContestStatus('finished'); clearInterval(timer); }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [contestStatus, endTime]);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const timeAgo = (timestamp) => {
    const diffSeconds = Math.floor(Date.now() / 1000) - timestamp;
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds/60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds/3600)}h ago`;
    return `${Math.floor(diffSeconds/86400)}d ago`;
  };

  const handleToggleMashupTag = (tag) => {
    if (mashupTags.includes(tag)) setMashupTags(mashupTags.filter(t => t !== tag));
    else setMashupTags([...mashupTags, tag]);
  };
  const toggleExpandedTag = (tag) => { setExpandedTags(prev => ({ ...prev, [tag]: !prev[tag] })); };

  const fetchBlogs = async () => {
    try { const res = await axios.get(`${BACKEND_URL}/api/v1/blogs`); setBlogs(res.data); } 
    catch (err) { console.error("Error pulling dev logs"); }
  };

  const handleCreateBlog = async (e) => {
    e.preventDefault(); if (!blogTitle || !blogContent) return;
    try {
      await axios.post(`${BACKEND_URL}/api/v1/blogs`, { title: blogTitle, author: handle, content: blogContent });
      setBlogTitle(''); setBlogContent(''); fetchBlogs();
    } catch (err) { alert("Failed to save post"); }
  };

  const handleRecordMatch = async (e) => {
    e.preventDefault(); if (matchScore1 === '' || matchScore2 === '') return;
    try {
      await axios.post(`${BACKEND_URL}/api/v1/rivalry/match`, { player1: handle, player2: rivalHandle, score1: Number(matchScore1), score2: Number(matchScore2) });
      setMatchScore1(''); setMatchScore2('');
      if (activeTab === 'compare') handleFetchData(); 
    } catch (err) { alert("Failed to record match"); }
  };

  const handleFetchData = async () => {
    setLoading(true); setError(null); setExpandedTags({}); 
    try {
      if (activeTab === 'dashboard') {
        const dashRes = await axios.get(`${BACKEND_URL}/api/v1/dashboard/${handle}`);
        const feedRes = await axios.get(`${BACKEND_URL}/api/v1/feed?handles=${leaderboardInput}`);
        const predRes = await axios.get(`${BACKEND_URL}/api/v1/predict/${handle}`);
        setData({ ...dashRes.data, feed: feedRes.data.feed , prediction: predRes.data});
      } else if (activeTab === 'training') {
        const response = await axios.get(`${BACKEND_URL}/api/v1/upsolve/${handle}?rating_min=${ratingMin}&rating_max=${ratingMax}&tag=${trainingTag}`);
        setData(response.data);
      } else if (activeTab === 'compare') {
        const response = await axios.get(`${BACKEND_URL}/api/v1/compare?handle1=${handle}&handle2=${rivalHandle}`);
        setData(response.data);
      } else if (activeTab === 'mashup') {
        setContestStatus('idle'); setEndTime(null); 
        const tagsQuery = mashupTags.length > 0 ? mashupTags.join(',') : 'all';
        const response = await axios.get(`${BACKEND_URL}/api/v1/mashup/${handle}?tags=${tagsQuery}&rating_min=${ratingMin}&rating_max=${ratingMax}&count=${contestCount}&duration=${mashupDuration}`);
        setContestData(response.data);
      } else if (activeTab === 'leaderboard') {
        const response = await axios.get(`${BACKEND_URL}/api/v1/leaderboard?handles=${leaderboardInput}`);
        setLeaderboardData(response.data.leaderboard);
      }
    } catch (err) { setError(err.response?.data?.detail || 'Failed communication.'); } 
    finally { setLoading(false); }
  };

  const glassCardClass = "bg-white/80 dark:bg-gray-900/60 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-xl rounded-3xl p-6 transition-all";

  return (
    <div className="min-h-screen font-sans transition-colors duration-500 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="border-b border-gray-300/50 dark:border-gray-700/50 pb-6 mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-400 tracking-tight">
              Ultimate Codeforces Hub
            </h1>
            <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">Decoupled React + FastAPI Engine</p>
          </div>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-3 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-md shadow-sm border border-gray-200 dark:border-gray-700 font-bold hover:scale-105 transition-transform">
            {!isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </header>

        <div className="flex gap-3 flex-wrap mb-8">
          {['dashboard', 'training', 'mashup', 'leaderboard', 'blogs', 'compare'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2.5 rounded-xl font-bold transition-all capitalize shadow-sm ${ activeTab === tab ? 'bg-blue-600 text-white shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] -translate-y-0.5' : 'bg-white/60 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 hover:bg-white dark:hover:bg-gray-700' }`}>
               {tab === 'dashboard' ? '📊 Analytics' : tab === 'training' ? '🎯 Training' : tab === 'mashup' ? '⏱️ Virtual Contest' : tab === 'leaderboard' ? '🏆 Leaderboard' : tab === 'blogs' ? '✍️ Editorials' : '🥊 Rivalry'}
            </button>
          ))}
        </div>

        {/* --- DYNAMIC CONTROL PANEL --- */}
        {['dashboard', 'training', 'mashup', 'compare', 'leaderboard'].includes(activeTab) && (
          <div className="bg-white/40 dark:bg-gray-800/30 backdrop-blur-md p-6 rounded-3xl mb-8 shadow-inner border border-gray-200/50 dark:border-gray-700/50 space-y-4">
            <div className="flex gap-4 flex-wrap items-end">
              {activeTab !== 'leaderboard' && (
                <div>
                  <label className="block mb-2 font-bold text-sm text-gray-600 dark:text-gray-300">Your Handle</label>
                  <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} className="p-2.5 rounded-xl border border-gray-300/50 dark:border-gray-600/50 bg-white/80 dark:bg-gray-900/80 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" />
                </div>
              )}
              {activeTab === 'compare' && (
                <div>
                  <label className="block mb-2 font-bold text-sm text-gray-600 dark:text-gray-300">Rival Handle</label>
                  <input type="text" value={rivalHandle} onChange={(e) => setRivalHandle(e.target.value)} className="p-2.5 rounded-xl border border-gray-300/50 dark:border-gray-600/50 bg-white/80 dark:bg-gray-900/80 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" />
                </div>
              )}
              {(activeTab === 'leaderboard' || activeTab === 'dashboard') && (
                <div className="flex-1 min-w-[300px]">
                  <label className="block mb-2 font-bold text-sm text-gray-600 dark:text-gray-300">Squad Feed Handles (comma separated)</label>
                  <input type="text" value={leaderboardInput} onChange={(e) => setLeaderboardInput(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-300/50 dark:border-gray-600/50 bg-white/80 dark:bg-gray-900/80 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" />
                </div>
              )}
              {(activeTab === 'training' || activeTab === 'mashup') && (
                <div className="flex items-center gap-2">
                  <div><label className="block mb-2 font-bold text-sm text-gray-600 dark:text-gray-300">Min Rating</label><input type="number" step="100" value={ratingMin} onChange={(e) => setRatingMin(Number(e.target.value))} className="p-2.5 rounded-xl border border-gray-300/50 dark:border-gray-600/50 bg-white/80 dark:bg-gray-900/80 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 shadow-sm" /></div>
                  <span className="font-bold text-gray-400 mt-6">-</span>
                  <div><label className="block mb-2 font-bold text-sm text-gray-600 dark:text-gray-300">Max Rating</label><input type="number" step="100" value={ratingMax} onChange={(e) => setRatingMax(Number(e.target.value))} className="p-2.5 rounded-xl border border-gray-300/50 dark:border-gray-600/50 bg-white/80 dark:bg-gray-900/80 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 shadow-sm" /></div>
                </div>
              )}
              {activeTab === 'training' && (
                <div>
                  <label className="block mb-2 font-bold text-sm text-gray-600 dark:text-gray-300">Target Topic</label>
                  <select value={trainingTag} onChange={(e) => setTrainingTag(e.target.value)} className="p-2.5 rounded-xl border border-gray-300/50 dark:border-gray-600/50 bg-white/80 dark:bg-gray-900/80 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer">
                    <option value="auto">🤖 Auto-Detect</option>{AVAILABLE_TAGS.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                </div>
              )}
              {activeTab === 'mashup' && (
                <>
                  <div>
                    <label className="block mb-2 font-bold text-sm text-gray-600 dark:text-gray-300">Duration</label>
                    <select value={mashupDuration} onChange={(e) => setMashupDuration(Number(e.target.value))} className="p-2.5 rounded-xl border border-gray-300/50 dark:border-gray-600/50 bg-white/80 dark:bg-gray-900/80 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-32 shadow-sm cursor-pointer"><option value={60}>1 Hour</option><option value={120}>2 Hours</option></select>
                  </div>
                  <div>
                    <label className="block mb-2 font-bold text-sm text-gray-600 dark:text-gray-300">Count</label>
                    <select value={contestCount} onChange={(e) => setContestCount(Number(e.target.value))} className="p-2.5 rounded-xl border border-gray-300/50 dark:border-gray-600/50 bg-white/80 dark:bg-gray-900/80 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-20 shadow-sm cursor-pointer">{[3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select>
                  </div>
                </>
              )}
              <button onClick={handleFetchData} disabled={contestStatus === 'active' && activeTab === 'mashup'} className={`px-8 py-2.5 text-white font-bold rounded-xl shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] transition-all ml-auto ${contestStatus === 'active' && activeTab === 'mashup' ? 'bg-gray-500 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-500 hover:shadow-[0_6px_20px_rgba(37,99,235,0.23)] hover:-translate-y-0.5'}`}>
                {loading ? 'Processing...' : 'Execute'}
              </button>
            </div>
            {activeTab === 'mashup' && (
              <div className="pt-4 border-t border-gray-300/50 dark:border-gray-600/50">
                 <label className="block mb-3 font-bold text-sm text-gray-600 dark:text-gray-300">Topics (Multi-Select):</label>
                 <div className="flex flex-wrap gap-2">
                   {AVAILABLE_TAGS.map(tag => (
                     <button key={tag} onClick={() => handleToggleMashupTag(tag)} className={`px-4 py-1.5 text-sm font-bold rounded-full border transition-all ${mashupTags.includes(tag) ? 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-400 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'bg-transparent border-gray-400/50 text-gray-500 hover:border-gray-400'}`}>{tag}</button>
                   ))}
                 </div>
              </div>
            )}
          </div>
        )}

        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-700 dark:text-red-400 p-4 mb-8 rounded-2xl backdrop-blur-md font-medium">⚠️ {error}</div>}
        {loading && <div className="text-lg text-blue-500 font-bold animate-pulse mb-8 tracking-wider">Processing neural queries...</div>}

        {/* =========================================
                      TAB 1: MASHUP
            ========================================= */}
        {activeTab === 'mashup' && (
          <div className={glassCardClass}>
            {!contestData || !contestData.contest ? (
               <div className="text-center py-16 text-gray-500 dark:text-gray-400"><span className="text-6xl block mb-6 opacity-50">⚡</span><p className="text-2xl font-extrabold mb-2 text-gray-700 dark:text-gray-200">No active contest.</p><p className="font-medium">Adjust your parameters above and click "Execute" to generate a new virtual arena.</p></div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-8 border-b border-gray-200/50 dark:border-gray-700/50 pb-6">
                   <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-orange-500">⏱️ Virtual Arena</h2>
                   {contestStatus === 'idle' && (
                      <button onClick={() => { setContestStatus('active'); setEndTime(Date.now() + (contestData.duration_minutes * 60 * 1000)); setTimeLeft(contestData.duration_minutes * 60); }} className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.6)] transition-all duration-300 hover:scale-105 animate-pulse hover:animate-none tracking-widest">START CONTEST</button>
                   )}
                   {contestStatus === 'active' && (
                      <div className="text-right"><p className={`text-5xl font-black font-mono tracking-wider ${timeLeft < 300 ? 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse' : 'text-blue-500 dark:text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]'}`}>{formatTime(timeLeft)}</p><p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-2">Remaining Time</p></div>
                   )}
                   {contestStatus === 'finished' && (
                       <div className="text-right"><p className="text-5xl font-black text-gray-400 font-mono tracking-wider">00:00:00</p><p className="text-xs text-red-500 font-bold uppercase tracking-widest mt-2">Contest Over</p></div>
                   )}
                </div>
                {contestStatus === 'idle' ? (
                   <div className="py-16 text-center text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-900/30 rounded-2xl border border-dashed border-gray-300/50 dark:border-gray-600/50"><span className="text-6xl block mb-6 opacity-80 drop-shadow-md">🔒</span><p className="text-2xl font-extrabold mb-2 text-gray-700 dark:text-gray-200">Problems are securely locked.</p><p className="font-medium">Click "Start Contest" to break the seal and begin your {contestData.duration_minutes}-minute timer.</p></div>
                ) : (
                   <div className="space-y-3">
                     {contestData.contest.map((prob, i) => (
                       <div key={i} className={`p-5 border flex justify-between items-center rounded-2xl transition-all duration-300 ${contestStatus === 'finished' ? 'border-gray-200/50 dark:border-gray-700/50 opacity-60 bg-transparent' : 'border-gray-200 dark:border-gray-700 hover:border-blue-500/50 bg-white/50 dark:bg-gray-800/50 hover:shadow-lg'}`}>
                         <div>
                           <div className="font-bold text-xl mb-1 text-gray-800 dark:text-gray-100"><span className="text-blue-500 mr-2">{String.fromCharCode(65 + i)}.</span> {prob.problem_name}</div>
                           <div className="flex gap-3 text-xs text-gray-500 items-center mt-2"><span className="px-2 py-1 rounded-md bg-gray-200/50 dark:bg-gray-700/50 font-bold text-gray-700 dark:text-gray-300">Rating: {prob.rating}</span><span className="uppercase tracking-wider font-semibold opacity-80">{prob.tags.slice(0, 3).join(', ')}</span></div>
                         </div>
                         {contestStatus === 'active' ? (
                            <a href={prob.url} target="_blank" rel="noreferrer" className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] transition-all hover:-translate-y-0.5">Solve</a>
                         ) : ( <button disabled className="px-8 py-2.5 bg-gray-200 dark:bg-gray-800 text-gray-400 rounded-xl font-bold cursor-not-allowed border border-gray-300 dark:border-gray-700">Locked</button> )}
                       </div>
                     ))}
                   </div>
                )}
              </>
            )}
          </div>
        )}

        {/* =========================================
                      TAB 2: TRAINING
            ========================================= */}
        {activeTab === 'training' && (
          <div className={glassCardClass}>
             <h2 className="text-3xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-indigo-500">🧠 Smart Recommender</h2>
             {!data || !data.recommended_upsolves ? (
                <div className="py-16 text-center text-gray-500 dark:text-gray-400"><p className="text-lg font-medium">Click "Execute" to scan the Codeforces neural net for tailored problem recommendations.</p></div>
             ) : (
               <>
                 <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">Targeting <span className="font-bold text-red-500 uppercase px-2 py-1 bg-red-500/10 rounded-md mx-1">{data.critical_weakness}</span> algorithms between ratings <span className="font-bold">{data.rating_range}</span>.</p>
                 <div className="space-y-4">
                   {data.recommended_upsolves.map((prob, i) => (
                     <div key={i} className="flex justify-between items-center p-5 bg-white/50 dark:bg-gray-800/50 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 hover:border-purple-500/50 transition-all hover:shadow-lg">
                       <div>
                         <div className="font-bold text-xl text-gray-800 dark:text-gray-100 mb-2">{prob.id} - {prob.name}</div>
                         <div className="flex gap-2 mt-2"><span className="px-3 py-1 text-xs font-bold rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">⭐ {prob.rating}</span><span className="px-3 py-1 text-xs font-bold rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 uppercase tracking-wide">{prob.tag}</span></div>
                       </div>
                       <a href={prob.url} target="_blank" rel="noreferrer" className="px-8 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold shadow-[0_4px_14px_0_rgba(34,197,94,0.39)] transition-all hover:-translate-y-0.5">Initialize</a>
                     </div>
                   ))}
                 </div>
               </>
             )}
          </div>
        )}

        {/* =========================================
                      TAB 3: DASHBOARD & FEED
            ========================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {data && data.current_streak !== undefined && (
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-8 rounded-3xl text-white shadow-[0_10px_30px_rgba(99,102,241,0.4)] flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                    <div className="relative z-10"><h3 className="text-3xl font-extrabold mb-1">Current Solve Streak</h3><p className="opacity-90 font-medium text-lg">Unstoppable momentum.</p></div>
                    <div className="text-6xl font-black relative z-10 drop-shadow-md">{data.current_streak} <span className="text-2xl font-bold opacity-80 uppercase tracking-widest ml-1">Days</span></div>
                </div>
            )}
            {/* NEW: RATING FORECAST & TRAJECTORY */}
            {data && data.prediction && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={`${glassCardClass} flex flex-col justify-center items-center text-center relative overflow-hidden`}>
                   <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
                   <h3 className="text-xl font-extrabold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Next Contest Forecast</h3>
                   <div className="flex items-end justify-center gap-4 mb-4">
                      <div>
                        <p className="text-sm font-bold text-gray-400">Current</p>
                        <p className="text-4xl font-black text-gray-800 dark:text-gray-100">{data.prediction.current_rating}</p>
                      </div>
                      <div className="pb-2 text-2xl">➔</div>
                      <div>
                        <p className="text-sm font-bold text-gray-400">Predicted</p>
                        <p className={`text-5xl font-black drop-shadow-md ${data.prediction.delta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {data.prediction.predicted_rating}
                        </p>
                      </div>
                   </div>
                   <div className={`px-4 py-1.5 rounded-full font-bold text-sm ${data.prediction.delta >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      Expected Delta: {data.prediction.delta > 0 ? '+' : ''}{data.prediction.delta}
                   </div>
                </div>

                <div className={`lg:col-span-2 ${glassCardClass}`}>
                  <h3 className="text-xl font-extrabold mb-4 text-gray-800 dark:text-gray-100">📈 Rating Trajectory</h3>
                  <div className="w-full h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.prediction.history_chart} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} vertical={false} />
                        <XAxis dataKey="contest" stroke={isDarkMode ? '#9ca3af' : '#4b5563'} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis domain={['auto', 'auto']} stroke={isDarkMode ? '#9ca3af' : '#4b5563'} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
                          itemStyle={{ fontWeight: 'bold', color: '#3b82f6' }}
                        />
                        <ReferenceLine y={1900} stroke="#8b5cf6" strokeDasharray="4 4" label={{ position: 'top', value: 'Candidate Master (1900)', fill: '#8b5cf6', fontSize: 11, fontWeight: 'bold' }} />
                        <Line type="monotone" dataKey="rating" name="Rating" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: isDarkMode ? '#1f2937' : '#ffffff' }} activeDot={{ r: 6, shadow: '0 0 10px #3b82f6' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* SCROLLABLE 1-YEAR HEATMAP */}
              <div className={`lg:col-span-2 ${glassCardClass}`}>
                <h3 className="text-2xl font-extrabold mb-6 text-gray-800 dark:text-gray-100">🔥 1-Year Activity Heatmap</h3>
                <div className="overflow-x-auto overflow-y-hidden pb-4">
                  <div className="grid grid-flow-col grid-rows-7 gap-1.5 w-max pr-4">
                    {(data?.heatmap_data || MOCK_HEATMAP).map((c, i) => (
                      <div key={i} className={`w-4 h-4 rounded-[4px] transition-all hover:scale-125 hover:shadow-[0_0_10px_rgba(34,197,94,0.6)] cursor-pointer ${c===0?'bg-gray-200/50 dark:bg-gray-700/50':c===1?'bg-green-300 dark:bg-green-900/80':c===2?'bg-green-400 dark:bg-green-700/80':c===3?'bg-green-500 dark:bg-green-600/90':'bg-green-600 dark:bg-green-500'}`} />
                    ))}
                  </div>
                </div>
              </div>
              <div className={`${glassCardClass} flex flex-col items-center`}>
                <h3 className="text-2xl font-extrabold mb-4 w-full text-left text-gray-800 dark:text-gray-100">🕸️ Tag Radar</h3>
                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data?.radar_data || []}>
                      <PolarGrid stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: isDarkMode ? '#9ca3af' : '#4b5563', fontSize: 12, fontWeight: 'bold' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
                      <Radar name="Solves" dataKey="A" stroke="#3b82f6" strokeWidth={3} fill="#3b82f6" fillOpacity={0.4} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* RATING DISTRIBUTION HISTOGRAM */}
            <div className={glassCardClass}>
              <h3 className="text-2xl font-extrabold mb-6 text-gray-800 dark:text-gray-100">📊 Rating Distribution</h3>
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.rating_distribution || MOCK_RATING_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} vertical={false} />
                    <XAxis dataKey="rating" stroke={isDarkMode ? '#9ca3af' : '#4b5563'} tick={{ fontSize: 12, fontWeight: 'bold' }} tickLine={false} axisLine={false} />
                    <YAxis stroke={isDarkMode ? '#9ca3af' : '#4b5563'} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip 
                      cursor={{ fill: isDarkMode ? '#374151' : '#f3f4f6' }}
                      contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', color: isDarkMode ? '#f3f4f6' : '#1f2937' }}
                      itemStyle={{ fontWeight: 'bold', color: '#8b5cf6' }}
                    />
                    <Bar dataKey="solved" name="Problems Solved" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={glassCardClass}>
                <h3 className="text-2xl font-extrabold mb-6 flex justify-between items-center text-gray-800 dark:text-gray-100">
                  <span>🌐 Squad Comm-Link</span><span className="text-xs font-bold text-blue-500 px-3 py-1 bg-blue-500/10 rounded-full uppercase tracking-wider">Live</span>
                </h3>
                <div className="h-96 overflow-y-auto space-y-4 pr-3">
                  {data?.feed ? data.feed.map((event, i) => (
                    <div key={i} className="flex flex-col border-b border-gray-200/50 dark:border-gray-700/50 pb-4">
                      <div className="flex justify-between items-center mb-2"><strong className="text-blue-600 dark:text-blue-400 font-bold text-lg">{event.handle}</strong><span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{timeAgo(event.timestamp)}</span></div>
                      <p className="text-base text-gray-700 dark:text-gray-300">Defeated <a href={event.url} target="_blank" className="font-bold hover:text-blue-500 transition-colors">{event.problem_name}</a></p>
                      <span className="inline-block mt-2 px-3 py-1 text-xs font-bold rounded-md bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20 w-fit">LVL {event.rating}</span>
                    </div>
                  )) : <div className="flex items-center justify-center h-full text-gray-500 font-medium">Awaiting telemetry. Execute sync.</div>}
                </div>
              </div>
              
              <div className={glassCardClass}>
                  <h3 className="text-2xl font-extrabold mb-6 text-gray-800 dark:text-gray-100">📝 Index by Tag</h3>
                  <div className="h-96 overflow-y-auto space-y-5 pr-3">
                    {data?.tag_drilldown ? Object.entries(data.tag_drilldown).map(([tag, problems]) => {
                      const isExpanded = expandedTags[tag];
                      const displayProblems = isExpanded ? problems : problems.slice(0, 5);
                      return (
                        <div key={tag} className="border-b border-gray-200/50 dark:border-gray-700/50 pb-4">
                            <h4 className="font-bold text-blue-600 dark:text-blue-400 capitalize mb-3 text-lg">{tag} <span className="text-sm font-normal text-gray-500">({problems.length})</span></h4>
                            <ul className="text-sm list-disc pl-5 opacity-90 space-y-1.5 text-gray-700 dark:text-gray-300 font-medium">{displayProblems.map(p => <li key={p}>{p}</li>)}</ul>
                            {problems.length > 5 && (
                                <button onClick={() => toggleExpandedTag(tag)} className="text-blue-500 hover:text-blue-400 text-xs mt-3 font-bold px-2 py-1 bg-blue-500/10 rounded-md transition-colors">
                                    {isExpanded ? '▲ Collapse Node' : `▼ Expand ${problems.length - 5} Records`}
                                </button>
                            )}
                        </div>
                      )
                    }) : <div className="flex items-center justify-center h-full text-gray-500 font-medium">Data index empty. Execute sync.</div>}
                  </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================
                      TAB 4: RIVALRY
            ========================================= */}
        {activeTab === 'compare' && (
          <div className="space-y-6">
            {!data || !data.player1 ? (
                <div className={`${glassCardClass} text-center py-16`}><p className="text-xl font-medium text-gray-500 dark:text-gray-400">Lock in a Rival Handle and initiate sequence to calculate odds.</p></div>
            ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                     <div className="bg-white/80 dark:bg-gray-900/60 backdrop-blur-xl shadow-xl rounded-3xl p-8 border-t-8 border-t-blue-500">
                        <h3 className="text-3xl font-black text-blue-600 dark:text-blue-400 mb-6">{data.player1.handle}</h3>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Critical Weaknesses</p>
                        <ul className="space-y-3">
                          {data.player1.top_weaknesses.map(w => (
                             <li key={w.topic} className="flex justify-between items-center border-b border-gray-200/50 dark:border-gray-700/50 pb-2"><span className="capitalize font-bold text-gray-700 dark:text-gray-200">{w.topic}</span><span className="text-red-500 font-black bg-red-500/10 px-3 py-1 rounded-md">{w.failures} Fails</span></li>
                          ))}
                        </ul>
                     </div>
                     <div className="bg-white/80 dark:bg-gray-900/60 backdrop-blur-xl shadow-xl rounded-3xl p-8 border-t-8 border-t-red-500">
                        <h3 className="text-3xl font-black text-red-600 dark:text-red-400 mb-6">{data.player2.handle}</h3>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Critical Weaknesses</p>
                        <ul className="space-y-3">
                          {data.player2.top_weaknesses.map(w => (
                             <li key={w.topic} className="flex justify-between items-center border-b border-gray-200/50 dark:border-gray-700/50 pb-2"><span className="capitalize font-bold text-gray-700 dark:text-gray-200">{w.topic}</span><span className="text-red-500 font-black bg-red-500/10 px-3 py-1 rounded-md">{w.failures} Fails</span></li>
                          ))}
                        </ul>
                     </div>
                  </div>

                  <div className={glassCardClass}>
                    <div className="flex justify-between items-center mb-8"><h2 className="text-3xl font-extrabold text-gray-800 dark:text-gray-100">🥊 Combat Ledger</h2></div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <form onSubmit={handleRecordMatch} className="bg-white/50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 h-fit shadow-inner">
                        <h4 className="font-extrabold mb-6 text-xl">Log Encounter</h4>
                        <div className="space-y-4 mb-6">
                          <div className="flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-200/50 dark:border-gray-700/50"><span className="font-bold text-blue-600 dark:text-blue-400">{handle}</span><input type="number" value={matchScore1} onChange={e=>setMatchScore1(e.target.value)} placeholder="0" className="w-16 p-2 text-center font-bold text-lg rounded-lg border dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" required/></div>
                          <div className="flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-200/50 dark:border-gray-700/50"><span className="font-bold text-red-600 dark:text-red-400">{rivalHandle}</span><input type="number" value={matchScore2} onChange={e=>setMatchScore2(e.target.value)} placeholder="0" className="w-16 p-2 text-center font-bold text-lg rounded-lg border dark:bg-gray-800 dark:border-gray-600 focus:ring-2 focus:ring-blue-500" required/></div>
                        </div>
                        <button type="submit" className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black rounded-xl shadow-[0_4px_14px_0_rgba(16,185,129,0.39)] transition-all hover:-translate-y-0.5 tracking-widest">COMMIT</button>
                      </form>
                      <div className="lg:col-span-2 overflow-y-auto h-[350px] border border-gray-200/50 dark:border-gray-700/50 rounded-2xl">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-md sticky top-0 z-10"><tr><th className="p-4 font-bold text-gray-600 dark:text-gray-300">Date</th><th className="p-4 font-bold text-gray-600 dark:text-gray-300">Matchup</th><th className="p-4 text-center font-bold text-gray-600 dark:text-gray-300">Final Score</th><th className="p-4 font-bold text-gray-600 dark:text-gray-300">Victor</th></tr></thead>
                          <tbody>
                            {data.match_history && data.match_history.length === 0 ? (
                              <tr><td colSpan="4" className="p-8 text-center text-gray-500 font-medium">Ledger is empty. Awaiting first combat.</td></tr>
                            ) : (
                              data.match_history && data.match_history.map((m, i) => (
                                <tr key={i} className="border-b border-gray-200/50 dark:border-gray-700/50 hover:bg-white/40 dark:hover:bg-gray-700/40 transition-colors"><td className="p-4 font-medium text-gray-500">{m.date}</td><td className="p-4 font-bold text-gray-700 dark:text-gray-200">{m.p1} <span className="text-gray-400 font-normal mx-1">v</span> {m.p2}</td><td className="p-4 text-center font-mono font-black text-lg bg-gray-50/50 dark:bg-gray-900/50 tracking-widest">{m.s1} - {m.s2}</td><td className="p-4 font-black text-yellow-600 dark:text-yellow-400 drop-shadow-sm">👑 {m.winner}</td></tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
            )}
          </div>
        )}

        {/* =========================================
                      TAB 5: LEADERBOARD
            ========================================= */}
        {activeTab === 'leaderboard' && (
          <div className={glassCardClass}>
            <h2 className="text-3xl font-extrabold mb-6 text-gray-800 dark:text-gray-100">🏆 Rolling 7-Day Standing</h2>
            {leaderboardData.length === 0 ? (
               <div className="py-16 text-center text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300/50 dark:border-gray-600/50 rounded-2xl"><p className="text-lg font-medium">Awaiting sync. Click "Execute" to pull live rankings.</p></div>
            ) : (
               <div className="overflow-hidden rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-inner">
                 <table className="w-full text-left border-collapse">
                   <thead><tr className="bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-300/50 dark:border-gray-600/50"><th className="p-5 font-bold">Rank</th><th className="p-5 font-bold">Handle</th><th className="p-5 text-center font-bold">7-Day Volume</th></tr></thead>
                   <tbody>
                     {leaderboardData.map((user, idx) => (
                       <tr key={user.handle} className={`border-b border-gray-200/50 dark:border-gray-700/50 transition-colors ${idx === 0 ? 'bg-yellow-500/10' : 'hover:bg-white/40 dark:hover:bg-gray-700/40'}`}><td className="p-5 font-black text-xl text-gray-500">#{idx + 1}</td><td className="p-5 font-black text-xl text-blue-600 dark:text-blue-400">{user.handle} {idx === 0 && '👑'}</td><td className={`p-5 text-center font-black text-xl ${user.solved_past_week > 0 ? 'text-green-600 dark:text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]' : 'text-gray-400'}`}>{user.solved_past_week} <span className="text-sm font-bold opacity-80">AC</span></td></tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            )}
          </div>
        )}

        {/* =========================================
                      TAB 6: BLOGS
            ========================================= */}
        {activeTab === 'blogs' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <form onSubmit={handleCreateBlog} className="bg-white/80 dark:bg-gray-900/60 backdrop-blur-xl shadow-xl rounded-3xl p-6 border border-gray-200/50 dark:border-gray-700/50 h-fit">
              <h3 className="text-2xl font-extrabold mb-6 text-gray-800 dark:text-gray-100">✍️ Publish Note</h3>
              <div className="mb-5"><label className="block font-bold mb-2 text-sm text-gray-600 dark:text-gray-300">Title</label><input type="text" value={blogTitle} onChange={(e) => setBlogTitle(e.target.value)} className="w-full p-3 rounded-xl border border-gray-300/50 dark:border-gray-600/50 bg-white/50 dark:bg-gray-800/50 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all" required/></div>
              <div className="mb-6"><label className="block font-bold mb-2 text-sm text-gray-600 dark:text-gray-300">Analysis Data</label><textarea value={blogContent} onChange={(e) => setBlogContent(e.target.value)} rows={6} className="w-full p-3 rounded-xl border border-gray-300/50 dark:border-gray-600/50 bg-white/50 dark:bg-gray-800/50 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all resize-none" required/></div>
              <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] transition-all hover:-translate-y-0.5 tracking-widest">BROADCAST</button>
            </form>
            <div className="md:col-span-2">
              <h2 className="text-3xl font-extrabold mb-6 text-gray-800 dark:text-gray-100">📡 Engineering Stream</h2>
              {blogs.map(post => (
                <div key={post.id} className="bg-white/80 dark:bg-gray-900/60 backdrop-blur-xl shadow-lg rounded-3xl p-6 mb-6 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl transition-shadow"><h3 className="text-2xl font-extrabold mb-2 text-gray-800 dark:text-gray-100">{post.title}</h3><p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Authored by <strong className="text-blue-500">{post.author}</strong> • {post.date}</p><p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap font-medium">{post.content}</p></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;