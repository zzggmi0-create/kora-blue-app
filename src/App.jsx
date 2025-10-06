import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut,
    sendPasswordResetEmail,
    signInWithCustomToken
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs,
    onSnapshot,     
    query, 
    where, 
    updateDoc,
    deleteDoc,
    orderBy,
    Timestamp,
    limit
} from 'firebase/firestore';
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from 'firebase/storage';
import logo from './assets/logo.png';
import * as XLSX from 'xlsx';
import NoticeBoard from './NoticeBoard';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

// --- Firebase 설정 ---
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  };

// --- Firebase 초기화 ---
let app;
let auth;
let db;
let storage;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
} catch (error) {
    console.error("[진단][오류] Firebase 초기화 실패:", error);
}

const appId = 'default-kora-blue-app';

function formatDuration(start, end) {
    if (!start || !end) return 'N/A';
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 'N/A';

    const milliseconds = endDate.getTime() - startDate.getTime();
    if (milliseconds < 0) return 'N/A';

    const totalHours = Math.floor(milliseconds / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    return `${days}일 (${totalHours}시간)`;
}

// --- 메인 앱 컴포넌트 ---
export default function App() {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [appMode, setAppMode] = useState(null); 
    const [loginError, setLoginError] = useState('');
    const [isDemoMode, setIsDemoMode] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (isDemoMode) {
                setLoading(false);
                return;
            }
            if (user && !user.isAnonymous) {
                const userDocRef = doc(db, `/artifacts/${appId}/public/data/users`, user.uid);
                try {
                    const docSnap = await getDoc(userDocRef);
                    if (docSnap.exists()) {
                        setLoginError('');
                        setUser(user);
                        setUserData(docSnap.data());
                    } else {
                        setLoginError(`로그인 성공, 그러나 Firestore에서 사용자 정보를 찾을 수 없습니다.`);
                        await signOut(auth);
                    }
                } catch (error) {
                    setLoginError(`데이터베이스 조회 중 오류 발생: ${error.message}`);
                    await signOut(auth);
                }
            } else {
                setUser(null);
                setUserData(null);
                setAppMode(null);
            }
            setLoading(false);
        });
        
        return () => unsubscribe();
    }, [isDemoMode]);

    const handleDemoLogin = (role) => {
        const demoUser = { uid: `demo-${role.toLowerCase()}`, isAnonymous: false, displayName: `${role} (데모)` };
        const demoUserData = {
            name: `${role} (데모)`,
            email: `${role.toLowerCase()}@demo.com`,
            organization: '데모기관',
            position: '데모직급',
            qualificationLevel: role,
            uid: `demo-${role.toLowerCase()}`,
            inspectionOffice: ['최고관리자', '협회관리자'].includes(role) ? ['데모검사소', '테스트2'] : ['데모검사소']
        };
        setUser(demoUser);
        setUserData(demoUserData);
        setIsDemoMode(true);
        setAppMode(null); 
    };

    const handleLogout = () => {
        if (isDemoMode) {
            setUser(null);
            setUserData(null);
            setIsDemoMode(false);
            setAppMode(null);
        } else {
            signOut(auth);
            setAppMode(null);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-screen bg-gray-100"><div className="text-xl font-bold">로딩 중...</div></div>;
    if (!user || !userData) return <LoginScreen initialError={loginError} onDemoLogin={handleDemoLogin} />;
    if (!appMode) return <ModeSelectionScreen setAppMode={setAppMode} userData={userData} onLogout={handleLogout} />;
    if (appMode === 'control') return <ControlSystemApp userData={userData} setAppMode={setAppMode} onLogout={handleLogout} />;
    if (appMode === 'analysis') return <AnalysisSystemApp userData={userData} setAppMode={setAppMode} onLogout={handleLogout} />;
}

// --- 화면 컴포넌트들 ---

function LoginScreen({ initialError, onDemoLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(initialError || '');
    const [message, setMessage] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [demoRole, setDemoRole] = useState('최고관리자');

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setIsLoggingIn(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            setError('로그인에 실패했습니다. 이메일 또는 비밀번호를 확인해주세요.');
            setIsLoggingIn(false);
        }
    };
    
    const handlePasswordReset = async () => {
        if (!email) { setError("비밀번호를 재설정할 이메일 주소를 입력해주세요."); return; }
        setError('');
        setMessage('');
        try {
            await sendPasswordResetEmail(auth, email);
            setMessage("비밀번호 재설정 이메일을 발송했습니다. 이메일을 확인해주세요.");
        } catch (error) {
            setError("비밀번호 재설정 이메일 발송에 실패했습니다.");
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
                <div className="text-center">
                    <img src={logo} alt="logo" className="mx-auto h-16 w-auto mb-4" />
                    <h1 className="text-3xl font-bold text-gray-800">수산물 방사능분석 플랫폼</h1>
                    <p className="text-gray-500">RadAn-Platform : Marine Products</p>
                    <div className="mt-2 text-sm text-gray-400">해양수산부·(사)한국방사능분석협회</div>
                </div>
                {error && <p className="text-red-500 text-sm text-center bg-red-100 p-3 rounded-lg">{error}</p>}
                {message && <p className="text-green-500 text-sm text-center bg-green-100 p-3 rounded-lg">{message}</p>}
                
                <form onSubmit={handleLogin} className="space-y-6">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일 주소" required className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" required className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="submit" disabled={isLoggingIn} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">{isLoggingIn ? '로그인 중...' : '로그인'}</button>
                </form>
                 <div className="text-center"><button onClick={handlePasswordReset} className="text-sm text-blue-600 hover:underline">비밀번호를 잊으셨나요?</button></div>

                <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t"></span></div>
                    <div className="relative flex justify-center text-sm"><span className="bg-white px-2 text-gray-500">또는</span></div>
                </div>
                <div className="space-y-3">
                    <p className="text-center text-sm text-gray-600">데모 모드로 접속하기</p>
                    <select value={demoRole} onChange={(e) => setDemoRole(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500">
                        {['최고관리자', '시료채취원', '분석원', '분석보조원', '기술책임자', '해수부(1)', '해수부(2)', '협회관리자'].map(r => <option key={r}>{r}</option>)}
                    </select>
                    <button onClick={() => onDemoLogin(demoRole)} className="w-full bg-teal-500 text-white font-bold py-3 rounded-lg hover:bg-teal-600">{demoRole} (으)로 데모 접속</button>
                </div>
            </div>
        </div>
    );
}

function ModeSelectionScreen({ setAppMode, userData, onLogout }) {
    const canAccessControlMode = ['최고관리자', '협회관리자', '해수부(1)', '해수부(2)'].includes(userData.qualificationLevel);

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="text-center p-8 bg-white shadow-lg rounded-lg w-full max-w-lg">
                <img src={logo} alt="logo" className="mx-auto h-36 w-auto mb-6" />
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">안녕하세요, {userData.name}님!</h1>
                <p className="mb-6 text-gray-600">접속할 모드를 선택해주세요.</p>
                <div className="flex flex-col sm:flex-row gap-4">
                    {canAccessControlMode && (
                         <button onClick={() => setAppMode('control')} className="flex-1 bg-indigo-600 text-white font-bold py-4 px-6 rounded-lg hover:bg-indigo-700">
                            <div>
                                <h2 className="text-xl font-bold">관제 모드</h2>
                                <p className="text-sm">(RadAn-Net)</p>
                            </div>
                        </button>
                    )}
                    <button onClick={() => setAppMode('analysis')} className="flex-1 bg-teal-500 text-white font-bold py-4 px-6 rounded-lg hover:bg-teal-600">
                        <div>
                            <h2 className="text-xl font-bold">분석 모드</h2>
                            <p className="text-sm">(RadAn-Flow)</p>
                        </div>
                    </button>
                </div>
                 <button onClick={onLogout} className="mt-8 text-gray-500 hover:text-gray-700">로그아웃</button>
            </div>
        </div>
    );
}

function AppShell({ children, pageTitle, userData, setAppMode, onLogout, onNavClick, currentPage }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [openMenu, setOpenMenu] = useState('admin_settings'); // Default open menu

    const navMenu = {
        analysis: [
            { id: 'home', title: '메인' },
            { id: 'analysis', title: '분석관리' },
            { id: 'analysis_status', title: '분석현황' },
            { id: 'work', title: '근무기록' },
            { id: 'inspection', title: '점검관리' },
            { id: 'history', title: '이력관리' },
        ],
        control: [
            { id: 'dashboard', title: '대시보드' },
            { id: 'progress', title: '진행현황' },
            { id: 'analysis_results', title: '분석결과' },
            { id: 'agency_info_page', title: '기관정보' },
            {
                id: 'admin_settings', title: '관리자설정', sub: [
                    { id: 'settings', title: '회원관리' },
                    { id: 'equipment', title: '장비이력관리' },
                    { id: 'agencies', title: '분석기관관리' },
                    { id: 'offices', title: '검사소관리' },
                    { id: 'notice_board', title: '공지사항' },
                ] 
            },
        ]
    };

    const appType = pageTitle === 'RadAn-Flow' ? 'analysis' : 'control';
    const currentNavItems = navMenu[appType];

    const handleNavClick = (id) => {
        onNavClick(id);
        setIsSidebarOpen(false);
    };

    const toggleSubMenu = (id) => {
        setOpenMenu(openMenu === id ? null : id);
    };

    const titles = {
        'RadAn-Net': { main: '수산물 방사능분석\n관제시스템', sub: 'RadAn-Net : Marine Products' },
        'RadAn-Flow': { main: '수산물 방사능분석\n절차관리', sub: 'RadAn-Flow : Marine Products' }
    };
    const titleInfo = titles[pageTitle] || { main: pageTitle, sub: '' };

    const renderNav = (items) => (
        <ul>
            {items.map(item => (
                <li key={item.id} className="mb-1">
                    {item.sub ? (
                        <>
                            <button onClick={() => toggleSubMenu(item.id)} className="w-full flex justify-between items-center py-2 px-4 rounded-lg text-gray-600 hover:bg-gray-100">
                                <span>{item.title}</span>
                                <span>{openMenu === item.id ? '▲' : '▼'}</span>
                            </button>
                            {openMenu === item.id && (
                                <ul className="pl-4 mt-1">
                                    {item.sub.map(subItem => (
                                        <li key={subItem.id} className="mb-1">
                                            <a href="#" onClick={(e) => { e.preventDefault(); handleNavClick(subItem.id); }} className={`block py-2 px-4 rounded-lg ${currentPage === subItem.id ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                                                {subItem.title}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    ) : (
                        <a href="#" onClick={(e) => { e.preventDefault(); handleNavClick(item.id); }} className={`block py-2 px-4 rounded-lg ${currentPage === item.id ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                            {item.title}
                        </a>
                    )}
                </li>
            ))}
        </ul>
    );

    return (
        <div className="flex h-screen bg-gray-50">
            <aside className={`fixed inset-y-0 left-0 bg-white shadow-md p-4 flex flex-col transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:relative md:w-64 z-30 transition-transform duration-300 border-r border-gray-300`}>
                <div className="py-4 border-b px-4 text-center">
                    <img src={logo} alt="logo" className="h-12 w-auto mx-auto mb-2" />
                    <div>
                        <h1 className="text-lg font-bold text-gray-800 whitespace-pre-line">{titleInfo.main}</h1>
                        {titleInfo.sub && <p className="text-xs text-gray-500">{titleInfo.sub}</p>}
                    </div>
                </div>
                <nav className="mt-6 flex-1">
                    {renderNav(currentNavItems)}
                </nav>
                 <div className="mt-auto">
                    <button onClick={() => setAppMode(null)} className="w-full text-left py-2 px-4 rounded-lg text-gray-600 hover:bg-gray-100"> 모드 선택으로 </button>
                    <button onClick={onLogout} className="w-full text-left py-2 px-4 rounded-lg text-red-500 hover:bg-red-50"> 로그아웃 </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col">
                <header className="md:hidden bg-white shadow-sm p-4 flex items-center">
                    <button onClick={() => setIsSidebarOpen(true)} className="text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
                    </button>
                    <h2 className="text-lg font-bold ml-4 whitespace-pre-line">{titleInfo.main}</h2>
                </header>
                <div className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</div>
            </main>
        </div>
    );
}

function AnalysisSystemApp({ userData, setAppMode, onLogout }) {
    const [page, setPage] = useState('home');
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [workLogs, setWorkLogs] = useState([]);
    const [isClockedIn, setIsClockedIn] = useState(false);
    const [workLogMessage, setWorkLogMessage] = useState('');
    const [isWorkLogLoading, setIsWorkLogLoading] = useState(true);

    const fetchLocation = () => {
        setLocationError('');
        setLocation(null);
        navigator.geolocation.getCurrentPosition(
            (position) => setLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
            (error) => {
                let message = 'GPS 위치 정보를 가져올 수 없습니다.';
                if (error.code === 1) message = 'GPS 권한이 거부되었습니다. 브라우저 설정을 확인해주세요.';
                if (error.code === 2) message = '위치 정보를 확인할 수 없습니다. 네트워크를 확인하거나 다시 시도해주세요.';
                if (error.code === 3) message = '위치 정보를 가져오는데 시간이 초과되었습니다.';
                setLocationError(message);
            }
        );
    };

    useEffect(() => {
        if (userData) {
            fetchLocation();
        }
    }, [userData]);

    useEffect(() => {
        if (!userData || !userData.uid) {
            setWorkLogs([]);
            setIsClockedIn(false);
            setIsWorkLogLoading(false);
            return;
        }

        setIsWorkLogLoading(true);
        const q = query(
            collection(db, `/artifacts/${appId}/public/data/worklogs`),
            where("userId", "==", userData.uid)
        );

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Sort on the client-side
                logs.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
                
                const recentLogs = logs.slice(0, 6);
                setWorkLogs(recentLogs);

                if (recentLogs.length > 0) {
                    setIsClockedIn(recentLogs[0].type === '출근');
                } else {
                    setIsClockedIn(false);
                }
                setIsWorkLogLoading(false);
            },
            (error) => {
                console.error("Error fetching work logs:", error);
                setWorkLogMessage("출퇴근 기록을 불러오는데 실패했습니다.");
                setIsWorkLogLoading(false); // Ensure loading is false on error
            }
        );

        return () => unsubscribe();
    }, [userData]);

    if (!userData) {
        return <div className="flex items-center justify-center h-full">사용자 정보를 불러오는 중...</div>;
    }

    const handleWork = async (type) => {
        setIsClockedIn(type === '출근');
        setWorkLogMessage('');

        const newLog = {
            id: `temp-${Date.now()}`,
            type,
            timestamp: { toDate: () => new Date() },
            location: location ? { lat: location.lat, lng: location.lng } : null
        };

        setWorkLogs(prevLogs => [newLog, ...prevLogs.slice(0, 7)]);

        try {
            await addDoc(collection(db, `/artifacts/${appId}/public/data/worklogs`), {
                userId: userData.uid,
                userName: userData.name,
                type,
                timestamp: Timestamp.now(),
                location: location ? { lat: location.lat, lng: location.lng } : null
            });
            setWorkLogMessage(`${type} 기록이 완료되었습니다.`);
        } catch (error) {
            setWorkLogMessage("근무기록 저장에 실패했습니다.");
            setIsClockedIn(type !== '출근');
            setWorkLogs(prevLogs => prevLogs.filter(log => log.id !== newLog.id));
        }
    };

    const renderPage = () => {
        const props = { 
            userData, 
            location, 
            locationError, 
            onRetryGps: fetchLocation, 
            setPage,
            workLogs,
            isClockedIn,
            handleWork,
            workLogMessage,
            setWorkLogMessage,
            isWorkLogLoading
        };
        switch (page) {
            case 'home': return <AnalysisHome {...props} />;
            case 'analysis': return <AnalysisManagement {...props} initialStep="analysis" />;
            case 'analysis_status': return <div>분석현황 페이지는 현재 개발 중입니다.</div>;
            case 'work': return <WorkLogPage {...props} />;
            default: return <AnalysisHome {...props} />;
        }
    };
    
    return <AppShell pageTitle="RadAn-Flow" userData={userData} setAppMode={setAppMode} onLogout={onLogout} onNavClick={setPage} currentPage={page}>{renderPage()}</AppShell>;
}

function ControlSystemApp({ userData, setAppMode, onLogout }) {
    const [page, setPage] = useState('dashboard');
    const renderPage = () => {
        switch(page) {
            case 'dashboard': return <ControlDashboard userData={userData} />;
            case 'progress': return <ProgressStatus />;
            case 'analysis_results': return <AnalysisResultsPage />;
            case 'agency_info_page': return <AgencyInfo />;
            case 'offices': return <InspectionOfficeManagement />;
            case 'agencies': return <AnalysisAgencyManagement />;
            case 'equipment': return <EquipmentManagement />;
            case 'settings': return <UserManagement />;
            case 'notice_board': return <NoticeBoard userData={userData} />;
            default: return <ControlDashboard userData={userData} />;
        }
    };
    return <AppShell pageTitle="RadAn-Net" userData={userData} setAppMode={setAppMode} onLogout={onLogout} onNavClick={setPage} currentPage={page}>{renderPage()}</AppShell>;
}

function DashboardEmergencyContacts() {

    const [users, setUsers] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');

    const [isLoading, setIsLoading] = useState(true);



    useEffect(() => {

        const fetchUsers = async () => {

            try {

                const usersSnapshot = await getDocs(collection(db, `/artifacts/${appId}/public/data/users`));

                const allUsers = usersSnapshot.docs.map(doc => doc.data());

                setUsers(allUsers);

            } catch (error) {

                console.error("비상연락망을 불러오는 데 실패했습니다:", error);

            } finally {

                setIsLoading(false);

            }

        };

        fetchUsers();

    }, []);



    const filteredUsers = users.filter(user =>

        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||

        user.inspectionOffice?.join(', ').toLowerCase().includes(searchTerm.toLowerCase())

    );



    return (

        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-300 mt-6">

            <h3 className="text-xl font-bold mb-4">비상연락망</h3>

            <input

                type="text"

                placeholder="이름 또는 검사소로 검색..."

                value={searchTerm}

                onChange={(e) => setSearchTerm(e.target.value)}

                className="w-full p-2 border rounded-md mb-4"

            />

            {isLoading ? (

                <p>연락처를 불러오는 중...</p>

            ) : (

                <ul className="space-y-3" style={{ maxHeight: '400px', overflowY: 'auto' }}>

                    {filteredUsers.map(user => (

                        <li key={user.uid} className="p-3 bg-gray-50 rounded-lg">

                            <p className="font-semibold">{user.name}</p>

                            <p className="text-sm text-gray-600">{user.organization} / {user.position}</p>

                            <p className="text-sm text-gray-500"><strong>검사소:</strong> {user.inspectionOffice?.join(', ') || 'N/A'}</p>

                            <p className="text-sm text-gray-500"><strong>연락처:</strong> {user.contact || '정보 없음'}</p>

                        </li>

                    ))}

                </ul>

            )}

        </div>

    );

}



function GisMap({ offices, samples }) {



    const defaultPosition = [36.5, 127.5]; // Default center of South Korea





    const officesWithCoords = offices.map(office => {



        // Assuming the coordinate field is named 'coordinates'



        if (typeof office.coordinates === 'string' && office.coordinates.includes(',')) {



            try {



                const [lat, lng] = office.coordinates



                    .replace(/[()]/g, '') // Remove parentheses



                    .split(',')



                    .map(coord => parseFloat(coord.trim()));



                



                if (!isNaN(lat) && !isNaN(lng)) {



                    return { ...office, lat, lng };



                }



            } catch (e) {



                console.error(`Could not parse coordinates for office ${office.name}: ${office.coordinates}`, e);



                return null;



            }



        }



        return null;



    }).filter(Boolean); // Filter out offices without valid coordinates



    return (



        <MapContainer center={defaultPosition} zoom={7} style={{ height: '100%', width: '100%' }} className="rounded-lg">



            <TileLayer



                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"



                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'



            />



            {officesWithCoords.map(office => {



                const recentSamples = samples



                    .filter(s => s.lab === office.name)



                    .sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate())



                    .slice(0, 3);





                return (



                    <Marker key={office.id} position={[office.lat, office.lng]}>



                        <Popup>



                            <div className="font-bold text-base">{office.name}</div>



                            <div className="text-sm text-gray-600">{office.address}</div>



                            <hr className="my-2"/>



                            <div className="space-y-1">



                                <div className="font-semibold">최근 시료 3건:</div>



                                {recentSamples.length > 0 ? (



                                    recentSamples.map(s => (



                                        <div key={s.id} className="text-xs">



                                            <span>{s.createdAt.toDate().toLocaleDateString()}: </span>



                                            <span>{s.itemName} - </span>



                                            <span className="font-medium">



                                                {s.history?.find(h => h.action === '분석평가')?.results?.[2]?.activity || '결과 없음'}



                                            </span>



                                        </div>



                                    ))



                                ) : (



                                    <div className="text-xs text-gray-500">최근 시료 정보가 없습니다.</div>



                                )}



                            </div>



                        </Popup>



                    </Marker>



                );



            })}



        </MapContainer>



    );



}



function ControlDashboard({ userData }) {



    const [dashboardData, setDashboardData] = useState({



        totalSamples: 0,



        receiptCount: 0,



        receivedCount: 0,



        doneCount: 0,



        totalOffices: 0,



    });



    const [offices, setOffices] = useState([]);



    const [samples, setSamples] = useState([]);



    const [loading, setLoading] = useState(true);



    const [error, setError] = useState('');





    useEffect(() => {



        const fetchData = async () => {



            try {



                const [samplesSnapshot, officesSnapshot] = await Promise.all([



                    getDocs(collection(db, `/artifacts/${appId}/public/data/samples`)),



                    getDocs(collection(db, `/artifacts/${appId}/public/data/inspection_offices`))



                ]);





                const allSamples = samplesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const allOffices = officesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));





                setSamples(allSamples);



                setOffices(allOffices);





                setDashboardData({



                    totalSamples: allSamples.length,



                    receiptCount: allSamples.filter(s => s.status === 'receive_wait').length,



                    receivedCount: allSamples.filter(s => s.status === 'prep_wait').length,



                    doneCount: allSamples.filter(s => s.status === 'analysis_done').length,



                    totalOffices: allOffices.length,



                });





            } catch (err) {



                console.error("대시보드 데이터 로딩 실패:", err);



                setError("데이터를 불러오는 데 실패했습니다.");



            } finally {



                setLoading(false);



            }



        };



        fetchData();



    }, []);





    if (loading) return <div className="text-center p-6">대시보드 데이터를 불러오는 중...</div>;



    if (error) return <div className="text-center p-6 text-red-500">{error}</div>;





    const stats = [



        { label: '총 시료', value: dashboardData.totalSamples, color: 'bg-blue-500' },



        { label: '시료접수', value: dashboardData.receiptCount, color: 'bg-yellow-500' },



        { label: '시료수령', value: dashboardData.receivedCount, color: 'bg-orange-500' },



        { label: '분석완료', value: dashboardData.doneCount, color: 'bg-green-500' },



    ];





    return (



        <div className="space-y-8">



            <div>



                <h2 className="text-3xl font-bold mb-2">대시보드</h2>



                <p className="text-gray-600">안녕하세요, {userData.name}님! 현재 시스템 현황입니다.</p>



            </div>





            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">



                {stats.map(stat => (



                    <div key={stat.label} className={`p-6 rounded-lg text-white shadow-lg ${stat.color}`}>



                        <p className="text-lg">{stat.label}</p>



                        <p className="text-4xl font-bold">{stat.value}</p>



                    </div>



                ))}



            </div>





            <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-300">



                <h3 className="text-xl font-bold mb-4">검사소 현황 (총 {dashboardData.totalOffices}개소)</h3>



                <div className="w-full h-96 bg-gray-200 rounded-lg">



                    <GisMap offices={offices} samples={samples} />



                </div>



            </div>





            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">



                <div className="lg:col-span-1">



                     <NoticeBoard userData={userData} />



                </div>



                <div className="lg:col-span-1">



                    <DashboardEmergencyContacts />



                </div>



            </div>



        </div>



    );



}



function ProgressStatus() {
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [samplesSnapshot, officesSnapshot] = await Promise.all([
                    getDocs(collection(db, `/artifacts/${appId}/public/data/samples`)),
                    getDocs(collection(db, `/artifacts/${appId}/public/data/inspection_offices`))
                ]);

                const allSamples = samplesSnapshot.docs.map(doc => doc.data());
                const allOffices = officesSnapshot.docs.map(doc => doc.data().name);

                const officeStats = allOffices.reduce((acc, officeName) => {
                    acc[officeName] = {
                        total: 0,
                        receipt: 0,
                        received: 0,
                        analysis_done: 0,
                        complete: 0,
                    };
                    return acc;
                }, {});

                allSamples.forEach(sample => {
                    if (officeStats[sample.lab]) {
                        officeStats[sample.lab].total++;
                        switch (sample.status) {
                            case 'receipt':
                                officeStats[sample.lab].receipt++;
                                break;
                            case 'prep_wait':
                                officeStats[sample.lab].received++;
                                break;
                            case 'analysis_done':
                                officeStats[sample.lab].analysis_done++;
                                break;
                            case 'complete':
                                officeStats[sample.lab].complete++;
                                break;
                            default:
                                break;
                        }
                    }
                });

                const statsArray = allOffices.map(name => ({
                    name,
                    ...officeStats[name]
                }));

                setStats(statsArray);
            } catch (err) {
                console.error("진행현황 데이터 로딩 실패:", err);
                setError("데이터를 불러오는 데 실패했습니다.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) return <div className="text-center p-6">데이터를 불러오는 중...</div>;
    if (error) return <div className="text-center p-6 text-red-500">{error}</div>;

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-300">
            <h2 className="text-2xl font-bold mb-6">검사소별 진행현황</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">검사소</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">총 시료</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">시료접수</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">시료수령</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">분석완료</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">결과통보</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {stats.map(office => (
                            <tr key={office.name}>
                                <td className="px-4 py-4 whitespace-nowrap font-medium text-gray-900">{office.name}</td>
                                <td className="px-4 py-4 whitespace-nowrap">{office.total}</td>
                                <td className="px-4 py-4 whitespace-nowrap">{office.receipt}</td>
                                <td className="px-4 py-4 whitespace-nowrap">{office.received}</td>
                                <td className="px-4 py-4 whitespace-nowrap">{office.analysis_done}</td>
                                <td className="px-4 py-4 whitespace-nowrap">{office.complete}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
function AnalysisResultsPage() {
    const [samples, setSamples] = useState([]);
    const [offices, setOffices] = useState([]);
    const [filteredSamples, setFilteredSamples] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filter states
    const [selectedOffice, setSelectedOffice] = useState('all');
    const [selectedType, setSelectedType] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');

    // Modal states
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [selectedSample, setSelectedSample] = useState(null);

    const sampleTypes = ['위판장', '양식장', '천일염', '기타'];
    const processSteps = [
        { id: 'receipt', name: '시료접수' }, { id: 'receive_wait', name: '시료수령 대기' },
        { id: 'prep_wait', name: '시료전처리 대기' }, { id: 'analysis_wait', name: '분석대기' },
        { id: 'analyzing', name: '분석중' }, { id: 'analysis_done', name: '분석완료' },
        { id: 'tech_review_wait', name: '기술책임자 검토' }, { id: 'assoc_review_wait', name: '협회 검토' },
        { id: 'complete', name: '최종완료' },
    ];
    
    const statusColorMap = {
        'receipt': 'bg-gray-100 text-gray-800',
        'receive_wait': 'bg-yellow-100 text-yellow-800',
        'prep_wait': 'bg-orange-100 text-orange-800',
        'analysis_wait': 'bg-blue-100 text-blue-800',
        'analyzing': 'bg-indigo-100 text-indigo-800',
        'analysis_done': 'bg-purple-100 text-purple-800',
        'tech_review_wait': 'bg-pink-100 text-pink-800',
        'assoc_review_wait': 'bg-red-100 text-red-800',
        'complete': 'bg-green-100 text-green-800',
    };


    useEffect(() => {
        const fetchData = async () => {
            try {
                const [samplesSnapshot, officesSnapshot] = await Promise.all([
                    getDocs(collection(db, `/artifacts/${appId}/public/data/samples`)),
                    getDocs(collection(db, `/artifacts/${appId}/public/data/inspection_offices`))
                ]);
                const allSamples = samplesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const allOffices = officesSnapshot.docs.map(doc => doc.data().name);
                setSamples(allSamples);
                setOffices(allOffices);
            } catch (err) {
                setError("데이터를 불러오는 데 실패했습니다.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    useEffect(() => {
        let result = samples;
        if (selectedOffice !== 'all') {
            result = result.filter(s => s.lab === selectedOffice);
        }
        if (selectedType !== 'all') {
            result = result.filter(s => s.type === selectedType);
        }
        if (selectedStatus !== 'all') {
            result = result.filter(s => s.status === selectedStatus);
        }
        setFilteredSamples(result);
    }, [samples, selectedOffice, selectedType, selectedStatus]);

    const handleEditClick = (sample) => {
        setSelectedSample(sample);
        setIsEditModalOpen(true);
    };

    const handleDeleteClick = (sample) => {
        setSelectedSample(sample);
        setIsDeleteConfirmOpen(true);
    };

    const handleUpdateSample = async (updatedData) => {
        if (!selectedSample) return;
        try {
            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, selectedSample.id);
            await updateDoc(sampleRef, updatedData);
            setSamples(prev => prev.map(s => s.id === selectedSample.id ? { ...s, ...updatedData } : s));
            setIsEditModalOpen(false);
            setSelectedSample(null);
        } catch (err) {
            console.error("시료 정보 업데이트 실패:", err);
            alert("업데이트에 실패했습니다.");
        }
    };

    const handleDeleteSample = async () => {
        if (!selectedSample) return;
        try {
            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, selectedSample.id);
            await deleteDoc(sampleRef);
            setSamples(prev => prev.filter(s => s.id !== selectedSample.id));
            setIsDeleteConfirmOpen(false);
            setSelectedSample(null);
        } catch (err) {
            console.error("시료 삭제 실패:", err);
            alert("삭제에 실패했습니다.");
        }
    };

    if (loading) return <div className="p-6 text-center">데이터를 불러오는 중...</div>;
    if (error) return <div className="p-6 text-center text-red-500">{error}</div>;

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-300">
            <h2 className="text-2xl font-bold mb-6">분석결과 조회</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <select value={selectedOffice} onChange={e => setSelectedOffice(e.target.value)} className="p-2 border rounded-md">
                    <option value="all">전체 검사소</option>
                    {offices.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="p-2 border rounded-md">
                    <option value="all">전체 시료분류</option>
                    {sampleTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className="p-2 border rounded-md">
                    <option value="all">전체 진행단계</option>
                    {processSteps.map(step => <option key={step.id} value={step.id}>{step.name}</option>)}
                </select>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">시료 ID</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">품목명</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">검사소</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">현재 단계</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">관리</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredSamples.map(sample => (
                            <tr key={sample.id}>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{sample.sampleCode}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{sample.itemName}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{sample.lab}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColorMap[sample.status] || 'bg-gray-100 text-gray-800'}`}>
                                        {processSteps.find(s => s.id === sample.status)?.name || sample.status}
                                    </span>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                    <button onClick={() => handleEditClick(sample)} className="text-indigo-600 hover:text-indigo-900 mr-4">수정</button>
                                    <button onClick={() => handleDeleteClick(sample)} className="text-red-600 hover:text-red-900">삭제</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isEditModalOpen && (
                <SampleEditModal 
                    sample={selectedSample} 
                    onSave={handleUpdateSample} 
                    onClose={() => setIsEditModalOpen(false)}
                    offices={offices}
                    processSteps={processSteps}
                    sampleTypes={sampleTypes}
                />
            )}

            {isDeleteConfirmOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold mb-4">정말 삭제하시겠습니까?</h3>
                        <p className="mb-6">시료 ID <span className="font-bold">{selectedSample?.sampleCode}</span>을(를) 삭제하면 되돌릴 수 없습니다.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteConfirmOpen(false)} className="px-4 py-2 bg-gray-200 rounded-md">취소</button>
                            <button onClick={handleDeleteSample} className="px-4 py-2 bg-red-600 text-white rounded-md">삭제</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SampleEditModal({ sample, onSave, onClose, offices, processSteps, sampleTypes }) {
    const [formData, setFormData] = useState({
        itemName: sample.itemName || '',
        sampleAmount: sample.sampleAmount || '',
        etc: sample.etc || '',
        location: sample.location || '',
        datetime: sample.datetime || '',
        type: sample.type || '',
        lab: sample.lab || '',
        status: sample.status || '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-6">시료 정보 수정 ({sample.sampleCode})</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">품목명</label>
                            <input type="text" name="itemName" value={formData.itemName} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">시료량 (kg)</label>
                            <input type="text" name="sampleAmount" value={formData.sampleAmount} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">시료 분류</label>
                            <select name="type" value={formData.type} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                                {sampleTypes.map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">접수 검사소</label>
                            <select name="lab" value={formData.lab} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                                {offices.map(office => <option key={office} value={office}>{office}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">채취 장소</label>
                            <input type="text" name="location" value={formData.location} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">채취 일시</label>
                            <input type="datetime-local" name="datetime" value={formData.datetime} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md"/>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700">진행 단계</label>
                            <select name="status" value={formData.status} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                                {processSteps.map(step => <option key={step.id} value={step.id}>{step.name}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700">추가정보</label>
                            <textarea name="etc" value={formData.etc} onChange={handleChange} rows="3" className="mt-1 block w-full p-2 border border-gray-300 rounded-md"></textarea>
                        </div>
                    </div>
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">취소</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md">저장</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function AgencyInfo() { return <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-300">기관정보 페이지는 현재 개발 중입니다.</div>; }

function EmergencyContacts({ currentUser }) {
    const [users, setUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const usersSnapshot = await getDocs(collection(db, `/artifacts/${appId}/public/data/users`));
                const allUsers = usersSnapshot.docs.map(doc => doc.data());
                
                const relevantUsers = allUsers.filter(user => {
                    // Skip the current user
                    if (user.uid === currentUser.uid) return false;
                    
                    // Include users from the same organization
                    if (user.organization === currentUser.organization) return true;

                    // Include users from the same inspection offices
                    const currentUserOffices = new Set(currentUser.inspectionOffice || []);
                    const userOffices = new Set(user.inspectionOffice || []);
                    const commonOffices = [...currentUserOffices].filter(office => userOffices.has(office));
                    return commonOffices.length > 0;
                });

                setUsers(relevantUsers);
            } catch (error) {
                console.error("비상연락망을 불러오는 데 실패했습니다:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUsers();
    }, [currentUser]);

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg mt-6 border border-gray-300">
            <h3 className="text-lg font-semibold border-b pb-2 mb-4">비상연락망</h3>
            <input
                type="text"
                placeholder="이름으로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-2 border rounded-md mb-4"
            />
            {isLoading ? (
                <p>연락처를 불러오는 중...</p>
            ) : (
                <ul className="space-y-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {filteredUsers.map(user => (
                        <li key={user.uid} className="p-3 bg-gray-50 rounded-lg">
                            <p className="font-semibold">{user.name}</p>
                            <p className="text-sm text-gray-600">{user.organization} / {user.position}</p>
                            <p className="text-sm text-gray-500">{user.contact || '연락처 정보 없음'}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function AnalysisHome({
    userData, 
    location, 
    locationError, 
    onRetryGps, 
    setPage,
    workLogs,
    isClockedIn,
    handleWork,
    workLogMessage,
    setWorkLogMessage,
    isWorkLogLoading
}) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="md:col-span-1 space-y-6">
                {/* User Profile */}
                <div className="bg-white p-6 rounded-lg shadow-lg text-center border border-gray-300">
                    <div className="w-24 h-24 rounded-full bg-gray-200 mx-auto mb-4 flex items-center justify-center">
                        {/* Placeholder for profile picture */}
                        <span className="text-gray-500">사진</span>
                    </div>
                    <h2 className="text-xl font-bold">{userData.name}</h2>
                    <p className="text-gray-600">{userData.organization}</p>
                    <p className="text-sm text-gray-500">{userData.position} / {userData.qualificationLevel}</p>
                    <p className="text-sm text-gray-500 mt-2"><strong>검사소:</strong> {userData.inspectionOffice?.join(', ')}</p>
                </div>

                {/* Attendance */}
                <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-300">
                    <h3 className="text-lg font-semibold border-b pb-2 mb-4">근무 기록</h3>
                    {workLogMessage && <p className={`p-3 rounded-lg mb-4 text-sm ${workLogMessage.includes('실패') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{workLogMessage}</p>}
                    <div className="flex gap-4 mb-4">
                        <button onClick={() => handleWork('출근')} disabled={isWorkLogLoading || isClockedIn} className="flex-1 bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:bg-gray-400">출근 기록</button>
                        <button onClick={() => handleWork('퇴근')} disabled={isWorkLogLoading || !isClockedIn} className="flex-1 bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 disabled:bg-gray-400">퇴근 기록</button>
                    </div>
                    
                    <div className="mt-4 space-y-2">
                        <h4 className="font-semibold text-sm">최근 출퇴근기록:</h4>
                        <ul className="text-xs text-gray-600 space-y-2">
                            {workLogs.map(log => (
                                <li key={log.id} className="p-2 bg-gray-50 rounded">
                                    <div className="flex justify-between font-semibold">
                                        <span>{log.type}</span>
                                        <span>{log.timestamp.toDate().toLocaleString()}</span>
                                    </div>
                                    <div className="text-right text-gray-500">
                                        {log.location ? (
                                            <a href={`https://www.google.com/maps?q=${log.location.lat},${log.location.lng}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                                GPS: {log.location.lat.toFixed(4)}, {log.location.lng.toFixed(4)}
                                            </a>
                                        ) : (
                                            <span>GPS: 정보 없음</span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Right Column */}
            <div className="md:col-span-2">
                <NoticeBoard userData={userData} />
                <EmergencyContacts currentUser={userData} />
            </div>
        </div>
    );
}

function WorkLogPage({ userData }) {
    const [allLogs, setAllLogs] = useState([]);
    const [filteredLogs, setFilteredLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(0); // 0 for "All Months"
    const [workDayCount, setWorkDayCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const logsPerPage = 20;

    const availableYears = [...new Set(allLogs.map(log => log.timestamp.toDate().getFullYear()))].sort((a, b) => b - a);

    useEffect(() => {
        if (!userData || !userData.uid) {
            setLoading(false);
            setError("사용자 정보가 없습니다.");
            return;
        }

        setLoading(true);
        const q = query(
            collection(db, `/artifacts/${appId}/public/data/worklogs`),
            where("userId", "==", userData.uid)
        );

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                logs.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
                setAllLogs(logs);
                setLoading(false);
            },
            (err) => {
                console.error("Error fetching all work logs:", err);
                setError("전체 근무기록을 불러오는데 실패했습니다.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [userData.uid]);

    useEffect(() => {
        if (allLogs.length > 0 && !availableYears.includes(selectedYear)) {
            setSelectedYear(availableYears[0] || new Date().getFullYear());
        }
    }, [allLogs, availableYears, selectedYear]);

    useEffect(() => {
        const filtered = allLogs.filter(log => {
            const logDate = log.timestamp.toDate();
            const yearMatch = logDate.getFullYear() === selectedYear;
            const monthMatch = selectedMonth === 0 ? true : (logDate.getMonth() + 1) === selectedMonth;
            return yearMatch && monthMatch;
        });
        setFilteredLogs(filtered);
        setCurrentPage(1); // Reset to first page on filter change

        const clockInDays = new Set();
        filtered.forEach(log => {
            if (log.type === '출근') {
                const dateString = log.timestamp.toDate().toISOString().split('T')[0];
                clockInDays.add(dateString);
            }
        });
        setWorkDayCount(clockInDays.size);

    }, [allLogs, selectedYear, selectedMonth]);

    const handleExcelExport = () => {
        const dataToExport = filteredLogs.map(log => ({
            '구분': log.type,
            '기록시간': log.timestamp.toDate().toLocaleString(),
            '위치 (위도)': log.location ? log.location.lat : 'N/A',
            '위치 (경도)': log.location ? log.location.lng : 'N/A',
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "근무기록");
        const monthString = selectedMonth === 0 ? '전체' : `${selectedMonth}월`;
        XLSX.writeFile(workbook, `근무기록_${selectedYear}년_${monthString}.xlsx`);
    };

    const indexOfLastLog = currentPage * logsPerPage;
    const indexOfFirstLog = indexOfLastLog - logsPerPage;
    const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);
    const totalPages = Math.ceil(filteredLogs.length / logsPerPage);

    if (loading) return <div className="text-center p-4">근무기록을 불러오는 중...</div>;
    if (error) return <div className="text-center p-4 text-red-500">{error}</div>;

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-6">전체 근무기록</h2>
            
            <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <select 
                    value={selectedYear} 
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="p-2 border rounded-md"
                >
                    {availableYears.length > 0 ? 
                        availableYears.map(year => <option key={year} value={year}>{year}년</option>) :
                        <option value={new Date().getFullYear()}>{new Date().getFullYear()}년</option>
                    }
                </select>
                <select 
                    value={selectedMonth} 
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    className="p-2 border rounded-md"
                >
                    <option value={0}>전체</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(month => <option key={month} value={month}>{month}월</option>)}
                </select>
                <button 
                    onClick={handleExcelExport}
                    disabled={filteredLogs.length === 0}
                    className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                    엑셀 다운로드
                </button>
                <div className="ml-auto text-lg">
                    <strong>총 출근일:</strong> <span className="font-bold text-blue-600">{workDayCount}</span>일
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-4">
                    {selectedYear}년 {selectedMonth === 0 ? '' : `${selectedMonth}월`} 근무기록
                </h3>
                <ul className="text-sm text-gray-700 space-y-3">
                    {currentLogs.length > 0 ? currentLogs.map(log => (
                        <li key={log.id} className="p-3 bg-gray-100 rounded-md">
                            <div className="flex justify-between font-semibold">
                                <span className={log.type === '출근' ? 'text-green-600' : 'text-red-600'}>{log.type}</span>
                                <span>{log.timestamp.toDate().toLocaleString()}</span>
                            </div>
                            <div className="text-right text-gray-500 text-xs mt-1">
                                {log.location ? (
                                    <a href={`https://www.google.com/maps?q=${log.location.lat},${log.location.lng}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                        GPS: {log.location.lat.toFixed(4)}, {log.location.lng.toFixed(4)}
                                    </a>
                                ) : (
                                    <span>GPS: 정보 없음</span>
                                )}
                            </div>
                        </li>
                    )) : (
                        <li className="p-4 text-center text-gray-500">해당 기간의 근무기록이 없습니다.</li>
                    )}
                </ul>
                {totalPages > 1 && (
                    <div className="mt-6 flex justify-center items-center gap-4">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 bg-gray-200 rounded-md disabled:opacity-50"
                        >
                            이전
                        </button>
                        <span>
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 bg-gray-200 rounded-md disabled:opacity-50"
                        >
                            다음
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function AnalysisManagement({ userData, location, locationError, onRetryGps, setPage, initialStep }) {
    const [samplesByStatus, setSamplesByStatus] = useState({});
    const [currentStep, setCurrentStep] = useState(initialStep || null); 
    const [selectedSample, setSelectedSample] = useState(null);
    const [message, setMessage] = useState('');

    const processSteps = [
        { id: 'receipt', name: '시료접수', component: SampleRegistrationForm, roles: ['시료채취원', '해수부(1)', '해수부(2)', '분석원', '분석보조원', '기술책임자', '협회관리자', '최고관리자'] },
        { id: 'receive_wait', name: '시료수령 대기', component: SampleReceiveScreen, roles: ['분석원', '분석보조원', '기술책임자', '협회관리자', '최고관리자'] },
        { id: 'prep_wait', name: '시료전처리 대기', component: SamplePrepScreen, roles: ['분석원', '분석보조원', '기술책임자', '협회관리자', '최고관리자'] },
        { id: 'analysis_wait', name: '분석대기', component: SampleAnalysisScreen, roles: ['분석원', '분석보조원', '기술책임자', '협회관리자', '최고관리자'] },
        { id: 'analyzing', name: '분석중', component: SampleAnalyzingScreen, roles: ['분석원', '분석보조원', '기술책임자', '협회관리자', '최고관리자'] },
        { id: 'analysis_done', name: '분석완료', component: SampleAnalysisDoneScreen, roles: ['분석원', '분석보조원', '기술책임자', '협회관리자', '최고관리자'] },
        { id: 'tech_review_wait', name: '기술책임자 검토', component: SampleTechReviewScreen, roles: ['기술책임자', '협회관리자', '최고관리자'] },
        { id: 'assoc_review_wait', name: '협회 검토', component: SampleAssocReviewScreen, roles: ['협회관리자', '최고관리자'] },
        { id: 'complete', name: '최종완료', component: null, roles: ['분석원', '분석보조원', '협회관리자', '최고관리자'] },
    ];

    useEffect(() => {
        if (!userData.inspectionOffice || userData.inspectionOffice.length === 0) {
            setMessage("사용자에게 지정된 검사소가 없어 시료를 조회할 수 없습니다.");
            setSamplesByStatus({}); // Clear existing data
            return;
        }
        const q = query(collection(db, `/artifacts/${appId}/public/data/samples`), where("lab", "in", userData.inspectionOffice));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const statusCounts = processSteps.reduce((acc, step) => ({ ...acc, [step.id]: [] }), {});
            console.log("AnalysisManagement - User Inspection Offices:", userData.inspectionOffice);
            querySnapshot.forEach((doc) => {
                const sample = { id: doc.id, ...doc.data() };
                console.log("AnalysisManagement - Sample Lab:", sample.lab, "Sample Code:", sample.sampleCode);
                if (statusCounts[sample.status]) statusCounts[sample.status].push(sample);
            });
            setSamplesByStatus(statusCounts);
            console.log("Samples by Status:", statusCounts);
        }, (error) => setMessage("샘플 데이터를 불러오는 데 실패했습니다."));
        return unsubscribe;
    }, [userData.inspectionOffice]);
    
    const handleStepClick = (stepId) => {
        setMessage('');
        const stepInfo = processSteps.find(s => s.id === stepId);
        if (!stepInfo) return;
        const canAccess = stepInfo.roles.includes(userData.qualificationLevel) || stepInfo.roles.includes('all');
        if(canAccess) { setCurrentStep(stepId); setSelectedSample(null); } 
        else { setMessage(`이 단계에 접근할 권한이 없습니다.`); } // Corrected typo: '권한이' instead of '권한이없습니다.'
    };
    
    const renderStepContent = () => {
        if (!currentStep) return <p className="text-center text-gray-500 mt-10">상단 플로우에서 단계를 선택하여 작업을 시작하세요.</p>;
        const stepInfo = processSteps.find(s => s.id === currentStep);
        if (!stepInfo) return null;
        const samplesForStep = samplesByStatus[currentStep] || [];
        const childProps = { userData, location, locationError, onRetryGps, showMessage: setMessage, setPage };

        if(selectedSample) {
            const DetailComponent = stepInfo.component;
            return DetailComponent ? <DetailComponent sample={selectedSample} {...childProps} setSelectedSample={setSelectedSample} /> : <p className="text-center mt-10">{stepInfo.name} 상세 화면은 현재 개발 중입니다.</p>;
        }
        
        if (currentStep === 'receipt') return <SampleRegistrationForm {...childProps} setCurrentStep={setCurrentStep} setPage={setPage} />;
        
        if (currentStep === 'prep_wait') {
            return (
                <div>
                    <h3 className="text-xl font-bold mb-4">{stepInfo.name} ({samplesForStep.length}건)</h3>
                    <div className="bg-white rounded-lg shadow">
                        <div className="grid grid-cols-4 gap-4 p-4 font-semibold border-b bg-gray-50 rounded-t-lg">
                            <div>시료ID</div>
                            <div>품목명</div>
                            <div>시료채취일시</div>
                            <div>시료수령일시</div>
                        </div>
                        <ul className="divide-y divide-gray-200">
                            {samplesForStep.length > 0 ? samplesForStep.map(sample => {
                                const receiveHistory = sample.history?.find(h => h.action === '시료수령');
                                const receiveDate = receiveHistory ? receiveHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                return (
                                    <li key={sample.id} onClick={() => stepInfo.component && setSelectedSample(sample)} className="grid grid-cols-4 gap-4 p-4 text-sm hover:bg-gray-50 cursor-pointer">
                                        <div className="font-medium text-gray-900">{sample.sampleCode}</div>
                                        <div>{sample.itemName}</div>
                                        <div>{sample.datetime ? new Date(sample.datetime).toLocaleString() : 'N/A'}</div>
                                        <div>{receiveDate}</div>
                                    </li>
                                );
                            }) : <li className="p-4 text-center text-gray-500">해당 단계의 시료가 없습니다.</li>}
                        </ul>
                    </div>
                </div>
            );
        }

        if (currentStep === 'analysis_wait') {
            return (
                <div>
                    <h3 className="text-xl font-bold mb-4">{stepInfo.name} ({samplesForStep.length}건)</h3>
                    <div className="bg-white rounded-lg shadow">
                        <div className="grid grid-cols-5 gap-4 p-4 font-semibold border-b bg-gray-50 rounded-t-lg">
                            <div>시료ID</div>
                            <div>품목명</div>
                            <div>시료채취일시</div>
                            <div>시료수령일시</div>
                            <div>전처리완료일시</div>
                        </div>
                        <ul className="divide-y divide-gray-200">
                            {samplesForStep.length > 0 ? samplesForStep.map(sample => {
                                const receiveHistory = sample.history?.find(h => h.action === '시료수령');
                                const prepHistory = sample.history?.find(h => h.action === '시료전처리');
                                const receiveDate = receiveHistory ? receiveHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                const prepDate = prepHistory ? prepHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                return (
                                    <li key={sample.id} onClick={() => stepInfo.component && setSelectedSample(sample)} className="grid grid-cols-5 gap-4 p-4 text-sm hover:bg-gray-50 cursor-pointer">
                                        <div className="font-medium text-gray-900">{sample.sampleCode}</div>
                                        <div>{sample.itemName}</div>
                                        <div>{sample.datetime ? new Date(sample.datetime).toLocaleString() : 'N/A'}</div>
                                        <div>{receiveDate}</div>
                                        <div>{prepDate}</div>
                                    </li>
                                );
                            }) : <li className="p-4 text-center text-gray-500">해당 단계의 시료가 없습니다.</li>}
                        </ul>
                    </div>
                </div>
            );
        }

        if (currentStep === 'analyzing') {
            return (
                <div>
                    <h3 className="text-xl font-bold mb-4">{stepInfo.name} ({samplesForStep.length}건)</h3>
                    <div className="bg-white rounded-lg shadow">
                        <div className="grid grid-cols-6 gap-4 p-4 font-semibold border-b bg-gray-50 rounded-t-lg">
                            <div>시료ID</div>
                            <div>품목명</div>
                            <div>시료채취일시</div>
                            <div>시료수령일시</div>
                            <div>전처리완료일시</div>
                            <div>계측시작일시</div>
                        </div>
                        <ul className="divide-y divide-gray-200">
                            {samplesForStep.length > 0 ? samplesForStep.map(sample => {
                                const receiveHistory = sample.history?.find(h => h.action === '시료수령');
                                const prepHistory = sample.history?.find(h => h.action === '시료전처리');
                                const analysisHistory = sample.history?.find(h => h.action === '분석');
                                const receiveDate = receiveHistory ? receiveHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                const prepDate = prepHistory ? prepHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                const analysisDate = analysisHistory ? new Date(analysisHistory.measurementDateTime).toLocaleString() : 'N/A';
                                return (
                                    <li key={sample.id} onClick={() => stepInfo.component && setSelectedSample(sample)} className="grid grid-cols-6 gap-4 p-4 text-sm hover:bg-gray-50 cursor-pointer">
                                        <div className="font-medium text-gray-900">{sample.sampleCode}</div>
                                        <div>{sample.itemName}</div>
                                        <div>{sample.datetime ? new Date(sample.datetime).toLocaleString() : 'N/A'}</div>
                                        <div>{receiveDate}</div>
                                        <div>{prepDate}</div>
                                        <div>{analysisDate}</div>
                                    </li>
                                );
                            }) : <li className="p-4 text-center text-gray-500">해당 단계의 시료가 없습니다.</li>}
                        </ul>
                    </div>
                </div>
            );
        }

        if (currentStep === 'analysis_done') {
}
    }
}