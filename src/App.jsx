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
            inspectionOffice: role === '관리자' ? ['데모검사소', '테스트2'] : ['데모검사소']
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
    const [demoRole, setDemoRole] = useState('관리자');

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
                        {['관리자', '시료채취원', '분석원', '분석보조원', '기술책임자', '해수부', '협회'].map(r => <option key={r}>{r}</option>)}
                    </select>
                    <button onClick={() => onDemoLogin(demoRole)} className="w-full bg-teal-500 text-white font-bold py-3 rounded-lg hover:bg-teal-600">{demoRole} (으)로 데모 접속</button>
                </div>
            </div>
        </div>
    );
}

function ModeSelectionScreen({ setAppMode, userData, onLogout }) {
    const canAccessControlMode = ['관리자', '해수부', '협회'].includes(userData.qualificationLevel);

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
            { id: 'receipt_status', title: '접수현황' },
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
            return;
        }

        const q = query(
            collection(db, `/artifacts/${appId}/public/data/worklogs`),
            where("userId", "==", userData.uid),
            orderBy("timestamp", "desc"),
            limit(6)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setWorkLogs(logs);

            if (logs.length > 0) {
                setIsClockedIn(logs[0].type === '출근');
            } else {
                setIsClockedIn(false);
            }
        });

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
            setWorkLogMessage
        };
        switch (page) {
            case 'home': return <AnalysisHome {...props} />;
            case 'analysis': return <AnalysisManagement {...props} initialStep="analysis" />;
            case 'receipt_status': return <div>접수현황 페이지는 현재 개발 중입니다.</div>;
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
            case 'analysis_results': return <AnalysisResults />;
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

function ProgressStatus() { return <div>진행현황 페이지는 현재 개발 중입니다.</div>; }
function AnalysisResults() { return <div>분석결과 페이지는 현재 개발 중입니다.</div>; }
function AgencyInfo() { return <div>기관정보 페이지는 현재 개발 중입니다.</div>;
}

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
    workLogMessage 
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
                        <button onClick={() => handleWork('출근')} disabled={isClockedIn} className="flex-1 bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:bg-gray-400">출근 기록</button>
                        <button onClick={() => handleWork('퇴근')} disabled={!isClockedIn} className="flex-1 bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 disabled:bg-gray-400">퇴근 기록</button>
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

function AnalysisManagement({ userData, location, locationError, onRetryGps, setPage, initialStep }) {
    const [samplesByStatus, setSamplesByStatus] = useState({});
    const [currentStep, setCurrentStep] = useState(initialStep || null); 
    const [selectedSample, setSelectedSample] = useState(null);
    const [message, setMessage] = useState('');

    const processSteps = [
        { id: 'receipt', name: '시료접수', component: SampleRegistrationForm, roles: ['시료채취원', '관리자'] },
        { id: 'receive_wait', name: '시료수령 대기', component: SampleReceiveScreen, roles: ['분석원', '분석보조원', '관리자'] },
        { id: 'prep_wait', name: '시료전처리 대기', component: SamplePrepScreen, roles: ['분석원', '분석보조원', '관리자'] },
        { id: 'analysis_wait', name: '분석대기', component: SampleAnalysisScreen, roles: ['분석원', '관리자'] },
        { id: 'analyzing', name: '분석중', component: SampleAnalyzingScreen, roles: ['분석원', '관리자'] },
        { id: 'analysis_done', name: '분석완료', component: SampleAnalysisDoneScreen, roles: ['분석원', '관리자'] },
        { id: 'tech_review_wait', name: '기술책임자 검토', component: SampleTechReviewScreen, roles: ['기술책임자', '관리자'] },
        { id: 'assoc_review_wait', name: '협회 검토', component: SampleAssocReviewScreen, roles: ['협회', '관리자'] },
        { id: 'complete', name: '최종완료', component: null, roles: ['all'] },
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
        else { setMessage(`이 단계에 접근할 권한이 없습니다.`); }
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
            return (
                <div>
                    <h3 className="text-xl font-bold mb-4">{stepInfo.name} ({samplesForStep.length}건)</h3>
                    <div className="bg-white rounded-lg shadow">
                        <div className="grid grid-cols-7 gap-4 p-4 font-semibold border-b bg-gray-50 rounded-t-lg text-sm">
                            <div>시료ID</div>
                            <div>품목명</div>
                            <div>시료채취일시</div>
                            <div>시료수령일시</div>
                            <div>전처리완료일시</div>
                            <div>계측시작일시</div>
                            <div>분석평가완료일시</div>
                        </div>
                        <ul className="divide-y divide-gray-200">
                            {samplesForStep.length > 0 ? samplesForStep.map(sample => {
                                const receiveHistory = sample.history?.find(h => h.action === '시료수령');
                                const prepHistory = sample.history?.find(h => h.action === '시료전처리');
                                const analysisHistory = sample.history?.find(h => h.action === '분석');
                                const evaluationHistory = sample.history?.find(h => h.action === '분석평가');
                                const receiveDate = receiveHistory ? receiveHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                const prepDate = prepHistory ? prepHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                const analysisDate = analysisHistory ? new Date(analysisHistory.measurementDateTime).toLocaleString() : 'N/A';
                                const evaluationDate = evaluationHistory ? evaluationHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                return (
                                    <li key={sample.id} onClick={() => stepInfo.component && setSelectedSample(sample)} className="grid grid-cols-7 gap-4 p-4 text-sm hover:bg-gray-50 cursor-pointer">
                                        <div className="font-medium text-gray-900">{sample.sampleCode}</div>
                                        <div>{sample.itemName}</div>
                                        <div>{sample.datetime ? new Date(sample.datetime).toLocaleString() : 'N/A'}</div>
                                        <div>{receiveDate}</div>
                                        <div>{prepDate}</div>
                                        <div>{analysisDate}</div>
                                        <div>{evaluationDate}</div>
                                    </li>
                                );
                            }) : <li className="p-4 text-center text-gray-500">해당 단계의 시료가 없습니다.</li>}
                        </ul>
                    </div>
                </div>
            );
        }

        if (currentStep === 'tech_review_wait') {
            return (
                <div>
                    <h3 className="text-xl font-bold mb-4">{stepInfo.name} ({samplesForStep.length}건)</h3>
                    <div className="bg-white rounded-lg shadow">
                        <div className="grid grid-cols-8 gap-4 p-4 font-semibold border-b bg-gray-50 rounded-t-lg text-xs">
                            <div>시료ID</div>
                            <div>품목명</div>
                            <div>시료채취일시</div>
                            <div>시료수령일시</div>
                            <div>전처리완료일시</div>
                            <div>계측시작일시</div>
                            <div>분석평가완료일시</div>
                            <div>결과통보일시</div>
                        </div>
                        <ul className="divide-y divide-gray-200">
                            {samplesForStep.length > 0 ? samplesForStep.map(sample => {
                                const receiveHistory = sample.history?.find(h => h.action === '시료수령');
                                const prepHistory = sample.history?.find(h => h.action === '시료전처리');
                                const analysisHistory = sample.history?.find(h => h.action === '분석');
                                const evaluationHistory = sample.history?.find(h => h.action === '분석평가');
                                const notificationHistory = sample.history?.find(h => h.action === '결과통보');
                                const receiveDate = receiveHistory ? receiveHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                const prepDate = prepHistory ? prepHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                const analysisDate = analysisHistory ? new Date(analysisHistory.measurementDateTime).toLocaleString() : 'N/A';
                                const evaluationDate = evaluationHistory ? evaluationHistory.timestamp.toDate().toLocaleString() : 'N/A';
                                const notificationDate = notificationHistory ? new Date(notificationHistory.notificationDate).toLocaleString() : 'N/A';
                                return (
                                    <li key={sample.id} onClick={() => stepInfo.component && setSelectedSample(sample)} className="grid grid-cols-8 gap-4 p-4 text-sm hover:bg-gray-50 cursor-pointer">
                                        <div className="font-medium text-gray-900">{sample.sampleCode}</div>
                                        <div>{sample.itemName}</div>
                                        <div>{sample.datetime ? new Date(sample.datetime).toLocaleString() : 'N/A'}</div>
                                        <div>{receiveDate}</div>
                                        <div>{prepDate}</div>
                                        <div>{analysisDate}</div>
                                        <div>{evaluationDate}</div>
                                        <div>{notificationDate}</div>
                                    </li>
                                );
                            }) : <li className="p-4 text-center text-gray-500">해당 단계의 시료가 없습니다.</li>}
                        </ul>
                    </div>
                </div>
            );
        }

        if (currentStep === 'assoc_review_wait') {
            return (
                <div>
                    <h3 className="text-xl font-bold mb-4">{stepInfo.name} ({samplesForStep.length}건)</h3>
                    <div className="bg-white rounded-lg shadow">
                        <div className="grid grid-cols-11 gap-4 p-4 font-semibold border-b bg-gray-50 rounded-t-lg text-xs">
                            <div>시료ID</div>
                            <div>품목명</div>
                            <div>채취-분석</div>
                            <div>분석-평가</div>
                            <div>시료채취일시</div>
                            <div>시료수령일시</div>
                            <div>전처리완료일시</div>
                            <div>계측시작일시</div>
                            <div>분석평가완료일시</div>
                            <div>결과통보일시</div>
                            <div>기술책임자검토일시</div>
                        </div>
                        <ul className="divide-y divide-gray-200">
                            {samplesForStep.length > 0 ? samplesForStep.map(sample => {
                                const receiveHistory = sample.history?.find(h => h.action === '시료수령');
                                const prepHistory = sample.history?.find(h => h.action === '시료전처리');
                                const analysisHistory = sample.history?.find(h => h.action === '분석');
                                const evaluationHistory = sample.history?.find(h => h.action === '분석평가');
                                const notificationHistory = sample.history?.find(h => h.action === '결과통보');
                                const techReviewHistory = sample.history?.find(h => h.action === '기술책임자검토');

                                const receiveDate = receiveHistory ? receiveHistory.timestamp.toDate() : null;
                                const prepDate = prepHistory ? prepHistory.timestamp.toDate() : null;
                                const analysisDate = analysisHistory?.measurementDateTime ? new Date(analysisHistory.measurementDateTime) : null;
                                const evaluationDate = evaluationHistory ? evaluationHistory.timestamp.toDate() : null;
                                const notificationDate = notificationHistory?.notificationDate ? new Date(notificationHistory.notificationDate) : null;
                                const techReviewDate = techReviewHistory ? techReviewHistory.timestamp.toDate() : null;
                                
                                const collectionDate = sample.datetime ? new Date(sample.datetime) : null;

                                return (
                                    <li key={sample.id} onClick={() => stepInfo.component && setSelectedSample(sample)} className="grid grid-cols-11 gap-4 p-4 text-sm hover:bg-gray-50 cursor-pointer">
                                        <div className="font-medium text-gray-900">{sample.sampleCode}</div>
                                        <div>{sample.itemName}</div>
                                        <div>{formatDuration(collectionDate, evaluationDate)}</div>
                                        <div>{formatDuration(receiveDate, evaluationDate)}</div>
                                        <div>{collectionDate ? collectionDate.toLocaleString() : 'N/A'}</div>
                                        <div>{receiveDate ? receiveDate.toLocaleString() : 'N/A'}</div>
                                        <div>{prepDate ? prepDate.toLocaleString() : 'N/A'}</div>
                                        <div>{analysisDate ? analysisDate.toLocaleString() : 'N/A'}</div>
                                        <div>{evaluationDate ? evaluationDate.toLocaleString() : 'N/A'}</div>
                                        <div>{notificationDate ? notificationDate.toLocaleString() : 'N/A'}</div>
                                        <div>{techReviewDate ? techReviewDate.toLocaleString() : 'N/A'}</div>
                                    </li>
                                );
                            }) : <li className="p-4 text-center text-gray-500">해당 단계의 시료가 없습니다.</li>}
                        </ul>
                    </div>
                </div>
            );
        }

        return (
            <div>
                <h3 className="text-xl font-bold mb-4">{stepInfo.name} ({samplesForStep.length}건)</h3>
                <div className="bg-white rounded-lg shadow">
                    <div className="grid grid-cols-4 gap-4 p-4 font-semibold border-b bg-gray-50 rounded-t-lg">
                        <div>시료ID</div>
                        <div>품목명</div>
                        <div>시료채취일시</div>
                        <div>접수일시</div>
                    </div>
                    <ul className="divide-y divide-gray-200">
                        {samplesForStep.length > 0 ? samplesForStep.map(sample => (
                             <li key={sample.id} onClick={() => stepInfo.component && setSelectedSample(sample)} className="grid grid-cols-4 gap-4 p-4 text-sm hover:bg-gray-50 cursor-pointer">
                                 <div className="font-medium text-gray-900">{sample.sampleCode}</div>
                                 <div>{sample.itemName}</div>
                                 <div>{sample.datetime ? new Date(sample.datetime).toLocaleString() : 'N/A'}</div>
                                 <div>{sample.createdAt ? sample.createdAt.toDate().toLocaleString() : 'N/A'}</div>
                             </li>
                        )) : <li className="p-4 text-center text-gray-500">해당 단계의 시료가 없습니다.</li>}
                    </ul>
                </div>
            </div>
        );
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">분석 관리</h2>
            {message && <p className={`p-3 bg-red-100 text-red-800 rounded-lg mb-4`}>{message}</p>}
            <div className="pb-4 mb-6"><div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-4">
                {processSteps.map((step) => {
                     const count = samplesByStatus[step.id]?.length || 0;
                     const canAccess = step.roles.includes(userData.qualificationLevel) || step.roles.includes('all');
                     if (step.id === 'receipt' || step.id === 'complete') {
                        return (
                           <button key={step.id} onClick={() => handleStepClick(step.id)} disabled={!canAccess}
                               className={`flex flex-col items-center justify-center p-3 rounded-lg h-28 text-center transition border-2 ${currentStep === step.id ? 'bg-blue-50 border-blue-500 shadow-md' : 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50'} ${canAccess ? 'cursor-pointer' : 'cursor-not-allowed bg-gray-100 text-gray-400'}`}>
                               <span className="font-semibold text-lg text-gray-700">{step.id === 'receipt' ? '접수하기' : step.name}</span>
                           </button>
                        );
                    }
                     return (
                        <button key={step.id} onClick={() => handleStepClick(step.id)} disabled={!canAccess}
                            className={`flex flex-col items-center justify-between p-3 rounded-lg h-28 text-center transition border-2 ${currentStep === step.id ? 'bg-blue-50 border-blue-500 shadow-md' : 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50'} ${canAccess ? 'cursor-pointer' : 'cursor-not-allowed bg-gray-100 text-gray-400'}`}>
                            <span className="font-semibold text-sm text-gray-700">{step.name}</span>
                            <span className={`flex items-center justify-center w-10 h-10 rounded-full text-lg font-bold ${currentStep === step.id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>{count}</span>
                        </button>
                     );
                })}
            </div></div>
            <div className="mt-6">{renderStepContent()}</div>
        </div>
    );
}

function SampleRegistrationForm({ userData, location, locationError, onRetryGps, setCurrentStep, showMessage, setPage }) {
    const [formData, setFormData] = useState({
        type: '위판장',
        location: '',
        datetime: '',
        itemName: '',
        sampleAmount: '',
        etc: '',
        collectorName: userData.name,
        collectorContact: userData.contact || '',
        receivingLab: '',
        sampleCode: '',
    });
    const [autoGenerateSampleCode, setAutoGenerateSampleCode] = useState(true);
    const [photos, setPhotos] = useState({ photo1: null, photo2: null });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [inspectionOffices, setInspectionOffices] = useState([]);
    const [error, setError] = useState('');
    const [signature, setSignature] = useState(null);

    useEffect(() => {
        const isDemoUser = userData.uid.startsWith('demo-');
        const fetchInspectionOffices = async () => {
            try {
                const officesSnapshot = await getDocs(collection(db, `/artifacts/${appId}/public/data/inspection_offices`));
                let offices = officesSnapshot.docs.map(doc => doc.data().name);

                if (userData.organization && !offices.includes(userData.organization)) {
                    offices.unshift(userData.organization);
                }

                if (isDemoUser) {
                    const demoOffice = '데모검사소';
                    if (!offices.includes(demoOffice)) {
                        offices.unshift(demoOffice);
                    }
                }
                
                setInspectionOffices(offices);

                if (offices.length > 0) {
                    const defaultLab = userData.organization && offices.includes(userData.organization)
                        ? userData.organization
                        : offices[0];
                    setFormData(prev => ({ ...prev, receivingLab: defaultLab }));
                }
            } catch (err) {
                setError("검사소 목록을 불러오는 데 실패했습니다.");
            }
        };
        fetchInspectionOffices();
    }, [userData.uid, userData.organization]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const { name, files } = e.target;
        if (files[0]) {
            setPhotos(prev => ({ ...prev, [name]: files[0] }));
        }
    };

    const handleSign = () => {
        setSignature({
            user: userData.name,
            datetime: new Date(),
            gps: location ? { lat: location.lat, lng: location.lng } : null
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');
        try {
            let sampleCode = formData.sampleCode;
            if (autoGenerateSampleCode) {
                const typePrefix = {
                    '위판장': 'AP',
                    '양식장': 'AC',
                    '천일염': 'SS',
                    '기타': 'MP'
                }[formData.type];

                const today = new Date();
                const dateStr = today.getFullYear().toString().slice(-2) + (today.getMonth() + 1).toString().padStart(2, '0') + today.getDate().toString().padStart(2, '0');
                
                const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
                const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

                const q = query(
                    collection(db, `/artifacts/${appId}/public/data/samples`),
                    where("createdAt", ">=", Timestamp.fromDate(startOfDay)),
                    where("createdAt", "<=", Timestamp.fromDate(endOfDay)),
                    where("sampleCode", ">=", `${typePrefix}-${dateStr}-000`),
                    where("sampleCode", "<=", `${typePrefix}-${dateStr}-999`)
                );

                const querySnapshot = await getDocs(q);
                const newSequence = (querySnapshot.size + 1).toString().padStart(3, '0');
                sampleCode = `${typePrefix}-${dateStr}-${newSequence}`;
            } else {
                if (!sampleCode) {
                    setError('시료 ID를 수동으로 입력해주세요.');
                    setIsSubmitting(false);
                    return;
                }
                const q = query(collection(db, `/artifacts/${appId}/public/data/samples`), where("sampleCode", "==", sampleCode));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    setError('이미 존재하는 시료 ID입니다.');
                    setIsSubmitting(false);
                    return;
                }
            }

            const photoURLs = {};
            if (photos.photo1) {
                const storageRef1 = ref(storage, `samples/${sampleCode}/photo1_${photos.photo1.name}`);
                await uploadBytes(storageRef1, photos.photo1);
                photoURLs.photo1 = await getDownloadURL(storageRef1);
            }
            if (photos.photo2) {
                const storageRef2 = ref(storage, `samples/${sampleCode}/photo2_${photos.photo2.name}`);
                await uploadBytes(storageRef2, photos.photo2);
                photoURLs.photo2 = await getDownloadURL(storageRef2);
            }

            console.log("SampleRegistrationForm - User Organization:", userData.organization);
            console.log("SampleRegistrationForm - Receiving Lab:", formData.receivingLab);

            const sampleDoc = {
                ...formData,
                sampleCode,
                status: 'receive_wait',
                lab: formData.receivingLab,
                photos: photoURLs,
                createdAt: Timestamp.now(),
                history: [{
                    action: '시료접수',
                    user: userData.name,
                    userId: userData.uid,
                    timestamp: Timestamp.now(),
                    signature: {
                        user: signature.user,
                        datetime: signature.datetime.toISOString(),
                        gps: signature.gps ? `${signature.gps.lat}, ${signature.gps.lng}` : 'N/A'
                    }
                }]
            };
            await addDoc(collection(db, `/artifacts/${appId}/public/data/samples`), sampleDoc);
            showMessage("시료 접수가 완료되었습니다.");
            setCurrentStep('receive_wait');
        } catch (error) {
            setError(`시료 접수에 실패했습니다: ${error.message}`);
            showMessage("시료 접수에 실패했습니다.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4">시료 접수</h3>
            {error && <p className="text-red-500 bg-red-100 p-3 rounded-lg mb-4">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">시료분류</label>
                        <div className="flex items-center space-x-4">
                            {['위판장', '양식장', '천일염', '기타'].map(type => (
                                <label key={type} className="flex items-center">
                                    <input
                                        type="radio"
                                        name="type"
                                        value={type}
                                        checked={formData.type === type}
                                        onChange={handleInputChange}
                                        className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">{type}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="sampleCode" className="block text-sm font-medium text-gray-700">시료 ID</label>
                        <div className="mt-1 flex items-center">
                            <input
                                type="text"
                                id="sampleCode"
                                name="sampleCode"
                                value={formData.sampleCode}
                                onChange={handleInputChange}
                                disabled={autoGenerateSampleCode}
                                required={!autoGenerateSampleCode}
                                className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                            />
                            <label className="ml-4 flex items-center flex-shrink-0">
                                <input
                                    type="checkbox"
                                    checked={autoGenerateSampleCode}
                                    onChange={(e) => {
                                        setAutoGenerateSampleCode(e.target.checked);
                                        if (e.target.checked) {
                                            setFormData(prev => ({ ...prev, sampleCode: '' }));
                                        }
                                    }}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="ml-2 text-sm text-gray-700">자동생성</span>
                            </label>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="itemName" className="block text-sm font-medium text-gray-700">품목명</label>
                        <input type="text" id="itemName" name="itemName" value={formData.itemName} placeholder="품목명" onChange={handleInputChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="collectorName" className="block text-sm font-medium text-gray-700">시료접수자</label>
                        <input type="text" id="collectorName" name="collectorName" value={formData.collectorName} disabled className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm bg-gray-100" />
                    </div>
                    <div>
                        <label htmlFor="collectorContact" className="block text-sm font-medium text-gray-700">연락처</label>
                        <input type="text" id="collectorContact" name="collectorContact" value={formData.collectorContact} onChange={handleInputChange} placeholder="연락처" required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label htmlFor="receivingLab" className="block text-sm font-medium text-gray-700">접수검사소명</label>
                        <select id="receivingLab" name="receivingLab" value={formData.receivingLab} onChange={handleInputChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                            {inspectionOffices.map(office => <option key={office} value={office}>{office}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="datetime" className="block text-sm font-medium text-gray-700">시료채취일</label>
                        <input type="datetime-local" id="datetime" name="datetime" value={formData.datetime} onChange={handleInputChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label htmlFor="location" className="block text-sm font-medium text-gray-700">채취장소</label>
                        <input type="text" id="location" name="location" value={formData.location} placeholder="채취장소" onChange={handleInputChange} required className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label htmlFor="sampleAmount" className="block text-sm font-medium text-gray-700">시료량</label>
                        <div className="mt-1 flex rounded-md shadow-sm">
                            <input type="number" id="sampleAmount" name="sampleAmount" value={formData.sampleAmount} placeholder="시료량" onChange={handleInputChange} required className="flex-1 block w-full p-2 border border-gray-300 rounded-none rounded-l-md focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                            <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">kg</span>
                        </div>
                    </div>
                     <div>
                        <label htmlFor="etc" className="block text-sm font-medium text-gray-700">추가정보 (필요시)</label>
                        <textarea id="etc" name="etc" value={formData.etc} onChange={handleInputChange} rows="3" className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"></textarea>
                    </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="photo1" className="block text-sm font-medium text-gray-700">시료사진1</label>
                        <input type="file" id="photo1" name="photo1" accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                    </div>
                    <div>
                        <label htmlFor="photo2" className="block text-sm font-medium text-gray-700">시료사진2</label>
                        <input type="file" id="photo2" name="photo2" accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                    </div>
                </div>

                <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold">전자결재</h4>
                    {signature ? (
                        <div className="mt-2 text-sm">
                            <p><strong>서명자:</strong> {signature.user}</p>
                            <p><strong>서명일시:</strong> {signature.datetime.toLocaleString()}</p>
                            <p><strong>위치기록:</strong> {signature.gps ? `${signature.gps.lat.toFixed(5)}, ${signature.gps.lng.toFixed(5)}` : 'N/A'}</p>
                        </div>
                    ) : (
                        <div className="mt-2">
                            <button type="button" onClick={handleSign} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">서명하기</button>
                            {locationError && <p className="text-sm text-yellow-600 mt-1">{locationError}</p>}
                        </div>
                    )}
                </div>

                <button type="submit" disabled={!signature || isSubmitting} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">{isSubmitting ? '접수 중...' : '접수 완료'}</button>
            </form>
        </div>
    );
}

function SampleReceiveScreen({ sample, userData, location, setSelectedSample, showMessage }) {
    const [photos, setPhotos] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [signature, setSignature] = useState(null);

    const handleFileChange = (e) => {
        if (e.target.files.length > 2) {
            showMessage("사진은 최대 2장까지 업로드 가능합니다.");
            e.target.value = null;
            return;
        }
        setPhotos(Array.from(e.target.files));
    };

    const handleSign = () => {
        setSignature({
            user: userData.name,
            datetime: new Date(),
            gps: location ? { lat: location.lat, lng: location.lng } : null
        });
    };

    const handleReceive = async () => {
        if (photos.length === 0) { showMessage("시료 수령 사진을 1장 이상 업로드해주세요."); return; }
        if (!signature) { showMessage("전자결재 서명을 진행해주세요."); return; }

        setIsSubmitting(true);
        try {
            const photoURLs = await Promise.all(
                photos.map(async (photo) => {
                    const storageRef = ref(storage, `samples/${sample.sampleCode}/receive_${photo.name}`);
                    await uploadBytes(storageRef, photo);
                    return await getDownloadURL(storageRef);
                })
            );

            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);
            const newHistoryEntry = {
                action: '시료수령',
                user: userData.name,
                userId: userData.uid,
                timestamp: Timestamp.now(),
                photos: photoURLs,
                signature: {
                    user: signature.user,
                    datetime: signature.datetime.toISOString(),
                    gps: signature.gps ? `${signature.gps.lat}, ${signature.gps.lng}` : 'N/A'
                }
            };

            await updateDoc(sampleRef, {
                status: 'prep_wait',
                history: [...sample.history, newHistoryEntry]
            });

            showMessage('시료 수령이 완료되었습니다.');
            setSelectedSample(null);
        } catch (error) {
            showMessage(`시료 수령 처리에 실패했습니다: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const registrationHistory = sample.history?.find(h => h.action === '시료접수');

    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div>
                <button onClick={() => setSelectedSample(null)} className="mb-4 text-blue-600 hover:underline">← 목록으로</button>
                <h3 className="text-2xl font-bold">시료 수령: {sample.sampleCode}</h3>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-lg font-semibold mb-2">시료 정보</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <p><strong>시료 ID:</strong> {sample.sampleCode}</p>
                    <p><strong>시료분류:</strong> {sample.type}</p>
                    <p><strong>품목명:</strong> {sample.itemName}</p>
                    <p><strong>시료접수자:</strong> {sample.collectorName}</p>
                    <p><strong>연락처:</strong> {sample.collectorContact}</p>
                    <p><strong>접수검사소명:</strong> {sample.lab}</p>
                    <p><strong>시료채취일:</strong> {sample.datetime}</p>
                    <p><strong>채취장소:</strong> {sample.location}</p>
                    <p><strong>시료량:</strong> {sample.sampleAmount} kg</p>
                    <p className="col-span-full"><strong>추가정보:</strong> {sample.etc || 'N/A'}</p>
                    <div className="col-span-full">
                        <strong>접수사진:</strong>
                        <div className="flex gap-4 mt-1">
                            {sample.photos?.photo1 && <a href={sample.photos.photo1} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">사진 1 보기</a>}
                            {sample.photos?.photo2 && <a href={sample.photos.photo2} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">사진 2 보기</a>}
                            {!sample.photos?.photo1 && !sample.photos?.photo2 && <span>N/A</span>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-lg font-semibold mb-2">시료인수사진 (최대 2건)</h4>
                <input type="file" multiple accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-lg font-semibold mb-2">전자결재</h4>
                <div className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4 divide-x divide-gray-200">
                    <div className="px-4">
                        <h5 className="font-semibold text-center mb-2">시료접수자</h5>
                        {registrationHistory?.signature ? (
                            <div className="mt-2 text-sm text-gray-600 space-y-1">
                                <p><strong>서명자:</strong> {registrationHistory.signature.user}</p>
                                <p><strong>서명일시:</strong> {new Date(registrationHistory.signature.datetime).toLocaleString()}</p>
                                <p><strong>위치기록:</strong> {registrationHistory.signature.gps}</p>
                            </div>
                        ) : <p className="text-sm text-gray-500 mt-2 text-center">접수 서명 정보가 없습니다.</p>}
                    </div>

                    <div className="px-4">
                        <h5 className="font-semibold text-center mb-2">시료수령자</h5>
                        {signature ? (
                            <div className="mt-2 text-sm space-y-1">
                                <p><strong>서명자:</strong> {signature.user}</p>
                                <p><strong>서명일시:</strong> {signature.datetime.toLocaleString()}</p>
                                <p><strong>위치기록:</strong> {signature.gps ? `${signature.gps.lat.toFixed(5)}, ${signature.gps.lng.toFixed(5)}` : 'N/A'}</p>
                            </div>
                        ) : (
                            <div className="mt-2 text-center">
                                <button type="button" onClick={handleSign} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">서명하기</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <button onClick={handleReceive} disabled={isSubmitting || !signature || photos.length === 0} className="mt-6 w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                {isSubmitting ? '처리 중...' : '시료 인수 완료'}
            </button>
        </div>
    );
}

function SamplePrepScreen({ sample, userData, location, setSelectedSample, showMessage }) {
    const [prepWeight, setPrepWeight] = useState('');
    const [photos, setPhotos] = useState([]);
    const [signature, setSignature] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [analysisType, setAnalysisType] = useState({ alpha: false, beta: false, gamma: false });

    const handleAnalysisTypeChange = (e) => {
        const { name, checked } = e.target;
        setAnalysisType(prev => ({ ...prev, [name]: checked }));
    };

    const handleFileChange = (e) => {
        if (e.target.files.length > 2) {
            showMessage("사진은 최대 2장까지 업로드 가능합니다.");
            e.target.value = null;
            return;
        }
        setPhotos(Array.from(e.target.files));
    };

    const handleSign = () => {
        setSignature({
            user: userData.name,
            datetime: new Date(),
            gps: location ? { lat: location.lat, lng: location.lng } : null
        });
    };

    const handleComplete = async () => {
        if (photos.length === 0 || !prepWeight) {
            showMessage("시료 조제 무게와 사진을 모두 입력해주세요.");
            return;
        }
        if (!signature) {
            showMessage("전자결재 서명을 진행해주세요.");
            return;
        }

        setIsSubmitting(true);
        try {
            const photoURLs = await Promise.all(
                photos.map(async (photo) => {
                    const storageRef = ref(storage, `samples/${sample.sampleCode}/prep_${photo.name}`);
                    await uploadBytes(storageRef, photo);
                    return await getDownloadURL(storageRef);
                })
            );

            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);
            const newHistoryEntry = {
                action: '시료전처리',
                user: userData.name,
                userId: userData.uid,
                timestamp: Timestamp.now(),
                prepWeight: `${prepWeight} kg`,
                photos: photoURLs,
                analysisType,
                signature: {
                    user: signature.user,
                    datetime: signature.datetime.toISOString(),
                    gps: signature.gps ? `${signature.gps.lat}, ${signature.gps.lng}` : 'N/A'
                }
            };

            await updateDoc(sampleRef, {
                status: 'analysis_wait',
                history: [...sample.history, newHistoryEntry],
                analysisType,
            });

            showMessage('시료 전처리가 완료되었습니다.');
            setSelectedSample(null);
        } catch (error) {
            showMessage(`시료 전처리 처리에 실패했습니다: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const registrationHistory = sample.history?.find(h => h.action === '시료접수');
    const receiveHistory = sample.history?.find(h => h.action === '시료수령');

    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div>
                <button onClick={() => setSelectedSample(null)} className="mb-4 text-blue-600 hover:underline">← 목록으로</button>
                <h3 className="text-2xl font-bold">시료 전처리: {sample.sampleCode}</h3>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-lg font-semibold mb-2">시료 정보</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <p><strong>시료 ID:</strong> {sample.sampleCode}</p>
                    <p><strong>시료분류:</strong> {sample.type}</p>
                    <p><strong>시료접수자:</strong> {sample.collectorName}</p>
                    <p><strong>연락처:</strong> {sample.collectorContact}</p>
                    <p><strong>시료채취일:</strong> {sample.datetime}</p>
                    <p><strong>채취장소:</strong> {sample.location}</p>
                    <p className="col-span-full"><strong>추가정보:</strong> {sample.etc || 'N/A'}</p>
                </div>
                <div className="mt-4 space-y-2">
                    <div>
                        <strong>시료접수사진:</strong>
                        <div className="flex gap-4 mt-1">
                            {sample.photos?.photo1 && <a href={sample.photos.photo1} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">사진 1 보기</a>}
                            {sample.photos?.photo2 && <a href={sample.photos.photo2} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">사진 2 보기</a>}
                            {!sample.photos?.photo1 && !sample.photos?.photo2 && <span>N/A</span>}
                        </div>
                    </div>
                    <div>
                        <strong>시료인수사진:</strong>
                        <div className="flex gap-4 mt-1">
                            {receiveHistory?.photos?.map((photo, index) => (
                                <a key={index} href={photo} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">사진 {index + 1} 보기</a>
                            ))}
                            {!receiveHistory?.photos && <span>N/A</span>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-lg font-semibold mb-2">분석유형</label>
                    <div className="flex items-center space-x-4">
                        {['alpha', 'beta', 'gamma'].map(type => (
                            <label key={type} className="flex items-center">
                                <input
                                    type="checkbox"
                                    name={type}
                                    checked={analysisType[type]}
                                    onChange={handleAnalysisTypeChange}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="ml-2 text-sm text-gray-700">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="prepWeight" className="block text-lg font-semibold mb-2">시료조제무게</label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                        <input type="number" id="prepWeight" value={prepWeight} onChange={(e) => setPrepWeight(e.target.value)} placeholder="시료량" required className="flex-1 block w-full p-2 border border-gray-300 rounded-none rounded-l-md focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                        <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">kg</span>
                    </div>
                </div>
                <div>
                    <label className="block text-lg font-semibold mb-2">시료조제사진 (최대 2건)</label>
                    <input type="file" multiple accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                </div>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-lg font-semibold mb-2">전자결재</h4>
                <div className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 divide-x divide-gray-200">
                    <div className="px-2">
                        <h5 className="font-semibold text-center mb-2">시료접수자</h5>
                        {registrationHistory?.signature ? (
                            <div className="mt-2 text-sm text-gray-600 space-y-1">
                                <p><strong>서명자:</strong> {registrationHistory.signature.user}</p>
                                <p><strong>서명일시:</strong> {new Date(registrationHistory.signature.datetime).toLocaleString()}</p>
                                <p><strong>위치기록:</strong> {registrationHistory.signature.gps}</p>
                            </div>
                        ) : <p className="text-sm text-gray-500 mt-2 text-center">정보 없음</p>}
                    </div>
                    <div className="px-2">
                        <h5 className="font-semibold text-center mb-2">시료수령자</h5>
                        {receiveHistory?.signature ? (
                            <div className="mt-2 text-sm text-gray-600 space-y-1">
                                <p><strong>서명자:</strong> {receiveHistory.signature.user}</p>
                                <p><strong>서명일시:</strong> {new Date(receiveHistory.signature.datetime).toLocaleString()}</p>
                                <p><strong>위치기록:</strong> {receiveHistory.signature.gps}</p>
                            </div>
                        ) : <p className="text-sm text-gray-500 mt-2 text-center">정보 없음</p>}
                    </div>
                    <div className="px-2">
                        <h5 className="font-semibold text-center mb-2">전처리수행자</h5>
                        {signature ? (
                            <div className="mt-2 text-sm space-y-1">
                                <p><strong>서명자:</strong> {signature.user}</p>
                                <p><strong>서명일시:</strong> {signature.datetime.toLocaleString()}</p>
                                <p><strong>위치기록:</strong> {signature.gps ? `${signature.gps.lat.toFixed(5)}, ${signature.gps.lng.toFixed(5)}` : 'N/A'}</p>
                            </div>
                        ) : (
                            <div className="mt-2 text-center">
                                <button type="button" onClick={handleSign} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">서명하기</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <button onClick={handleComplete} disabled={isSubmitting || !signature || photos.length === 0 || !prepWeight} className="mt-6 w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                {isSubmitting ? '처리 중...' : '시료 전처리 완료'}
            </button>
        </div>
    );
}

function SampleAnalysisScreen({ sample, userData, location, setSelectedSample, showMessage }) {
    const [measurementTime, setMeasurementTime] = useState('');
    const [measurementDateTime, setMeasurementDateTime] = useState('');
    const [equipmentCode, setEquipmentCode] = useState('');
    const [isNotApplicable, setIsNotApplicable] = useState(sample.type === '위판장');
    const [equipmentList, setEquipmentList] = useState([]);
    const [signature, setSignature] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchEquipment = async () => {
            if (userData.inspectionOffice && userData.inspectionOffice.length > 0) {
                const q = query(collection(db, `/artifacts/${appId}/public/data/equipment`), where("agency", "in", userData.inspectionOffice));
                const querySnapshot = await getDocs(q);
                const equipList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setEquipmentList(equipList);
                if (equipList.length > 0 && !isNotApplicable) {
                    setEquipmentCode(equipList[0].id);
                }
            }
        };
        fetchEquipment();
        if (isNotApplicable) {
            setEquipmentCode('해당없음');
        }
    }, [userData.inspectionOffice, isNotApplicable]);

    const handleSign = () => {
        setSignature({
            user: userData.name,
            datetime: new Date(),
            gps: location ? { lat: location.lat, lng: location.lng } : null
        });
    };

    const handleComplete = async () => {
        if (!measurementDateTime || !measurementTime) {
            showMessage("계측 정보를 모두 입력해주세요.");
            return;
        }
        if (!signature) {
            showMessage("전자결재 서명을 진행해주세요.");
            return;
        }

        setIsSubmitting(true);
        try {
            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);
            const newHistoryEntry = {
                action: '분석',
                user: userData.name,
                userId: userData.uid,
                timestamp: Timestamp.now(),
                measurementDateTime,
                measurementTime,
                equipmentCode,
                signature: {
                    user: signature.user,
                    datetime: signature.datetime.toISOString(),
                    gps: signature.gps ? `${signature.gps.lat}, ${signature.gps.lng}` : 'N/A'
                }
            };

            await updateDoc(sampleRef, {
                status: 'analyzing',
                history: [...sample.history, newHistoryEntry]
            });

            showMessage('분석이 시작되었습니다.');
            setSelectedSample(null);
        } catch (error) {
            showMessage(`분석 시작 처리에 실패했습니다: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const registrationHistory = sample.history?.find(h => h.action === '시료접수');
    const receiveHistory = sample.history?.find(h => h.action === '시료수령');
    const prepHistory = sample.history?.find(h => h.action === '시료전처리');

    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <div>
                <button onClick={() => setSelectedSample(null)} className="mb-4 text-blue-600 hover:underline">← 목록으로</button>
                <h3 className="text-2xl font-bold">분석 대기: {sample.sampleCode}</h3>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-lg font-semibold mb-2">시료 정보</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <p><strong>시료 ID:</strong> {sample.sampleCode}</p>
                    <p><strong>시료분류:</strong> {sample.type}</p>
                    <p><strong>품목명:</strong> {sample.itemName}</p>
                    <p><strong>시료접수자:</strong> {sample.collectorName}</p>
                    <p><strong>연락처:</strong> {sample.collectorContact}</p>
                    <p><strong>접수검사소명:</strong> {sample.lab}</p>
                    <p><strong>시료채취일:</strong> {sample.datetime}</p>
                    <p><strong>채취장소:</strong> {sample.location}</p>
                    <p><strong>시료량:</strong> {sample.sampleAmount} kg</p>
                    <p><strong>시료조제무게:</strong> {prepHistory?.prepWeight || 'N/A'}</p>
                    <p><strong>분석유형:</strong> {sample.analysisType ? Object.entries(sample.analysisType).filter(([, val]) => val).map(([key]) => key).join(', ') : 'N/A'}</p>
                    <p className="col-span-full"><strong>추가정보:</strong> {sample.etc || 'N/A'}</p>
                </div>
                <div className="mt-4 space-y-2">
                    {[
                        { title: '시료채취사진', photos: [sample.photos?.photo1, sample.photos?.photo2] },
                        { title: '시료인수사진', photos: receiveHistory?.photos },
                        { title: '시료전처리사진', photos: prepHistory?.photos }
                    ].map(({ title, photos }) => (
                        <div key={title}>
                            <strong>{title}:</strong>
                            <div className="flex gap-4 mt-1">
                                {photos?.length > 0 ? photos.filter(p => p).map((photo, index) => (
                                    <a key={index} href={photo} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">사진 {index + 1} 보기</a>
                                )) : <span>N/A</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="measurementDateTime" className="block text-lg font-semibold mb-2">계측일시</label>
                    <input type="datetime-local" id="measurementDateTime" value={measurementDateTime} onChange={(e) => setMeasurementDateTime(e.target.value)} required className="w-full p-2 border rounded-md" />
                </div>
                <div>
                    <label htmlFor="measurementTime" className="block text-lg font-semibold mb-2">계측시간</label>
                    <input type="text" id="measurementTime" value={measurementTime} onChange={(e) => setMeasurementTime(e.target.value)} placeholder="예: 3600초" required className="w-full p-2 border rounded-md" />
                </div>
                <div>
                    <label htmlFor="equipmentCode" className="block text-lg font-semibold mb-2">장비코드</label>
                    <div className="flex items-center gap-4">
                        <select id="equipmentCode" value={equipmentCode} onChange={(e) => setEquipmentCode(e.target.value)} disabled={isNotApplicable} className="flex-grow p-2 border rounded-md disabled:bg-gray-100">
                            {isNotApplicable ? <option>해당없음</option> : equipmentList.map(eq => <option key={eq.id} value={eq.id}>{eq.name} ({eq.model})</option>)}
                        </select>
                        {sample.type === '위판장' && (
                            <label className="flex items-center">
                                <input type="checkbox" checked={isNotApplicable} onChange={(e) => setIsNotApplicable(e.target.checked)} className="h-4 w-4" />
                                <span className="ml-2">해당없음</span>
                            </label>
                        )}
                    </div>
                </div>
            </div>

            <div className="border-t pt-4">
                <h4 className="text-lg font-semibold mb-2">전자결재</h4>
                <div className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-4 divide-x divide-gray-200">
                    {[
                        { title: '시료접수자', history: registrationHistory },
                        { title: '시료수령자', history: receiveHistory },
                        { title: '전처리수행자', history: prepHistory }
                    ].map(({ title, history }) => (
                        <div key={title} className="px-2">
                            <h5 className="font-semibold text-center mb-2">{title}</h5>
                            {history?.signature ? (
                                <div className="mt-2 text-sm text-gray-600 space-y-1">
                                    <p><strong>서명자:</strong> {history.signature.user}</p>
                                    <p><strong>서명일시:</strong> {new Date(history.signature.datetime).toLocaleString()}</p>
                                    <p><strong>위치기록:</strong> {history.signature.gps}</p>
                                </div>
                            ) : <p className="text-sm text-gray-500 mt-2 text-center">정보 없음</p>}
                        </div>
                    ))}
                    <div className="px-2">
                        <h5 className="font-semibold text-center mb-2">분석수행자</h5>
                        {signature ? (
                            <div className="mt-2 text-sm space-y-1">
                                <p><strong>서명자:</strong> {signature.user}</p>
                                <p><strong>서명일시:</strong> {signature.datetime.toLocaleString()}</p>
                                <p><strong>위치기록:</strong> {signature.gps ? `${signature.gps.lat.toFixed(5)}, ${signature.gps.lng.toFixed(5)}` : 'N/A'}</p>
                            </div>
                        ) : (
                            <div className="mt-2 text-center">
                                <button type="button" onClick={handleSign} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">서명하기</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <button onClick={handleComplete} disabled={isSubmitting || !signature || !measurementDateTime || !measurementTime} className="mt-6 w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                {isSubmitting ? '처리 중...' : '분석 시작'}
            </button>
        </div>
    );
}

function SampleAnalyzingScreen({ sample, userData, location, setSelectedSample, showMessage }) {

    const [results, setResults] = useState([]);

    const [newNuclideName, setNewNuclideName] = useState('');

    const [signature, setSignature] = useState(null);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const defaultNuclides = ['I-131', 'Cs-134', 'Cs-137', 'K-40'];



    useEffect(() => {

        if (sample.analysisType?.gamma) {

            setResults([

                { nuclide: 'I-131', isMda: false, mdaValue: '', activity: '', uncertainty: '' },

                { nuclide: 'Cs-134', isMda: false, mdaValue: '', activity: '', uncertainty: '' },

                { nuclide: 'Cs-137', isMda: false, mdaValue: '', activity: '', uncertainty: '' },

                { nuclide: 'K-40', isMda: false, mdaValue: '', activity: '', uncertainty: '' },

            ]);

        }

    }, [sample.analysisType]);



    const handleResultChange = (index, field, value) => {

        const newResults = [...results];

        newResults[index][field] = value;

        setResults(newResults);

    };



    const handleAddNuclide = () => {

        if (newNuclideName && !results.find(r => r.nuclide === newNuclideName)) {

            setResults([...results, { nuclide: newNuclideName, isMda: false, mdaValue: '', activity: '', uncertainty: '' }]);

            setNewNuclideName('');

        }

    };



    const handleRemoveNuclide = (indexToRemove) => {

        setResults(results.filter((_, index) => index !== indexToRemove));

    };



    const handleSign = () => {

        setSignature({

            user: userData.name,

            datetime: new Date(),

            gps: location ? { lat: location.lat, lng: location.lng } : null

        });

    };



    const handleComplete = async () => {

        if (!signature) {

            showMessage("전자결재 서명을 진행해주세요.");

            return;

        }

        setIsSubmitting(true);

        try {

            const finalResults = results.map(r => ({

                ...r,

                activity: r.isMda ? `< ${r.mdaValue}` : r.activity

            }));



            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);

            const newHistoryEntry = {

                action: '분석평가',

                user: userData.name,

                userId: userData.uid,

                timestamp: Timestamp.now(),

                results: finalResults,

                signature: {

                    user: signature.user,

                    datetime: signature.datetime.toISOString(),

                    gps: signature.gps ? `${signature.gps.lat}, ${signature.gps.lng}` : 'N/A'

                }

            };



            await updateDoc(sampleRef, {

                status: 'analysis_done',

                history: [...sample.history, newHistoryEntry]

            });



            showMessage("분석 평가가 완료되어 '분석 완료' 단계로 이동했습니다.");

            setSelectedSample(null);

        } catch (error) {

            showMessage(`분석 평가 처리에 실패했습니다: ${error.message}`);

        } finally {

            setIsSubmitting(false);

        }

    };



    const registrationHistory = sample.history?.find(h => h.action === '시료접수');

    const receiveHistory = sample.history?.find(h => h.action === '시료수령');

    const prepHistory = sample.history?.find(h => h.action === '시료전처리');

    const analysisHistory = sample.history?.find(h => h.action === '분석');



    return (

        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">

            <div>

                <button onClick={() => setSelectedSample(null)} className="mb-4 text-blue-600 hover:underline">← 목록으로</button>

                <h3 className="text-2xl font-bold">분석중: {sample.sampleCode}</h3>

            </div>



            <div className="border-t pt-4">

                <h4 className="text-lg font-semibold mb-2">시료 정보</h4>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">

                    <p><strong>시료 ID:</strong> {sample.sampleCode}</p>

                    <p><strong>시료분류:</strong> {sample.type}</p>

                    <p><strong>품목명:</strong> {sample.itemName}</p>

                    <p><strong>시료접수자:</strong> {sample.collectorName}</p>

                    <p><strong>연락처:</strong> {sample.collectorContact}</p>

                    <p><strong>접수검사소명:</strong> {sample.lab}</p>

                    <p><strong>시료채취일:</strong> {sample.datetime}</p>

                    <p><strong>채취장소:</strong> {sample.location}</p>

                    <p><strong>시료량:</strong> {sample.sampleAmount} kg</p>

                    <p><strong>시료조제무게:</strong> {prepHistory?.prepWeight || 'N/A'}</p>

                    <p><strong>분석유형:</strong> {sample.analysisType ? Object.entries(sample.analysisType).filter(([, val]) => val).map(([key]) => key).join(', ') : 'N/A'}</p>

                    <p><strong>계측일시:</strong> {analysisHistory?.measurementDateTime}</p>

                    <p><strong>계측시간:</strong> {analysisHistory?.measurementTime}</p>

                    <p><strong>장비코드:</strong> {analysisHistory?.equipmentCode}</p>

                    <p className="col-span-full"><strong>추가정보:</strong> {sample.etc || 'N/A'}</p>

                </div>

                <div className="mt-4 space-y-2">

                     {[{

                        title: '시료채취사진',

                        photos: [sample.photos?.photo1, sample.photos?.photo2]

                    }, {

                        title: '시료인수사진',

                        photos: receiveHistory?.photos

                    }, {

                        title: '시료전처리사진',

                        photos: prepHistory?.photos

                    }].map(({

                        title,

                        photos

                    }) => (

                        <div key={title}>

                            <strong>{title}:</strong>

                            <div className="flex gap-4 mt-1">

                                {photos?.length > 0 ? photos.filter(p => p).map((photo, index) => (

                                    <a key={index} href={photo} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">사진 {index + 1} 보기</a>

                                )) : <span>N/A</span>}

                            </div>

                        </div>

                    ))}

                </div>

            </div>



            <div className="border-t pt-4">

                <h4 className="text-lg font-semibold mb-2">시료분석결과 입력</h4>

                <div className="space-y-3">

                    <div className="grid grid-cols-12 gap-2 items-center font-semibold text-sm px-2">

                        <div className="col-span-2">핵종명</div>

                        <div className="col-span-1 text-center">MDA</div>

                        <div className="col-span-3">MDA 값</div>

                        <div className="col-span-3">방사능 농도</div>

                        <div className="col-span-1 text-center">±</div>

                        <div className="col-span-2">불확도</div>

                    </div>

                    {results.map((res, index) => (

                        <div key={index} className="grid grid-cols-12 gap-2 items-center">

                            <div className="col-span-2 font-semibold">{res.nuclide}</div>

                            <div className="col-span-1 flex justify-center">

                                <input type="checkbox" checked={res.isMda} onChange={(e) => handleResultChange(index, 'isMda', e.target.checked)} className="h-4 w-4" />

                            </div>

                            <div className="col-span-3 flex items-center">

                                {res.isMda && <span className="mr-1">{"<"}</span>}

                                <input type="text" placeholder="MDA 값" value={res.mdaValue} onChange={(e) => handleResultChange(index, 'mdaValue', e.target.value)} disabled={!res.isMda} className="p-2 border rounded-md w-full disabled:bg-gray-100" />

                            </div>

                            <div className="col-span-3">

                                <input type="text" placeholder="농도 값" value={res.activity} onChange={(e) => handleResultChange(index, 'activity', e.target.value)} disabled={res.isMda} className="p-2 border rounded-md w-full disabled:bg-gray-100" />

                            </div>

                            <div className="col-span-1 text-center">±</div>

                            <div className="col-span-2">

                                <input type="text" placeholder="불확도 값" value={res.uncertainty} onChange={(e) => handleResultChange(index, 'uncertainty', e.target.value)} disabled={res.isMda} className="p-2 border rounded-md w-full disabled:bg-gray-100" />

                            </div>

                            <button onClick={() => handleRemoveNuclide(index)} className="text-red-500">삭제</button>

                        </div>

                    ))}

                </div>

                <div className="mt-4 flex gap-2">

                    <input type="text" value={newNuclideName} onChange={(e) => setNewNuclideName(e.target.value)} placeholder="핵종 추가" className="p-2 border rounded-md" />

                    <button onClick={handleAddNuclide} className="bg-gray-200 px-4 rounded-md">추가</button>

                </div>

            </div>



            <div className="border-t pt-4">

                <h4 className="text-lg font-semibold mb-2">전자결재</h4>

                <div className="border rounded-lg p-2 grid grid-cols-1 md:grid-cols-5 gap-2 divide-x divide-gray-200">

                    {[{

                        title: '시료접수자',

                        history: registrationHistory

                    }, {

                        title: '시료수령자',

                        history: receiveHistory

                    }, {

                        title: '전처리수행자',

                        history: prepHistory

                    }, {

                        title: '분석수행자',

                        history: analysisHistory

                    }].map(({

                        title,

                        history

                    }) => (

                        <div key={title} className="px-2">

                            <h5 className="font-semibold text-center mb-2 text-sm">{title}</h5>

                            {history?.signature ? (

                                <div className="mt-2 text-xs text-gray-600 space-y-1">

                                    <p><strong>서명자:</strong> {history.signature.user}</p>

                                    <p><strong>서명일시:</strong> {new Date(history.signature.datetime).toLocaleString()}</p>

                                    <p><strong>위치기록:</strong> {history.signature.gps}</p>

                                </div>

                            ) : <p className="text-xs text-gray-500 mt-2 text-center">정보 없음</p>}

                        </div>

                    ))}

                    <div className="px-2">

                        <h5 className="font-semibold text-center mb-2 text-sm">분석평가자</h5>

                        {signature ? (

                            <div className="mt-2 text-xs space-y-1">

                                <p><strong>서명자:</strong> {signature.user}</p>

                                <p><strong>서명일시:</strong> {signature.datetime.toLocaleString()}</p>

                                <p><strong>위치기록:</strong> {signature.gps ? `${signature.gps.lat.toFixed(5)}, ${signature.gps.lng.toFixed(5)}` : 'N/A'}</p>

                            </div>

                        ) : (

                            <div className="mt-2 text-center">

                                <button type="button" onClick={handleSign} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 text-sm">서명하기</button>

                            </div>

                        )}

                    </div>

                </div>

            </div>



            <button onClick={handleComplete} disabled={isSubmitting || !signature} className="mt-6 w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">

                {isSubmitting ? '처리 중...' : '분석 평가 완료'}

            </button>

        </div>

    );

}



function SampleAnalysisDoneScreen({ sample, userData, location, setSelectedSample, showMessage }) {



    const [files, setFiles] = useState([]);



    const [signature, setSignature] = useState(null);



    const [isSubmitting, setIsSubmitting] = useState(false);



    const [notificationDate, setNotificationDate] = useState('');



    const reportRef = useRef();







    const handleFileChange = (e) => {



        if (e.target.files.length > 4) {



            showMessage("파일은 최대 4개까지 업로드 가능합니다.");



            e.target.value = null;



            return;



        }



        setFiles(Array.from(e.target.files));



    };







    const handleSign = () => {



        if (!notificationDate) {



            showMessage("통보완료일시를 먼저 입력해주세요.");



            return;



        }



        setSignature({



            user: userData.name,



            datetime: new Date(),



            gps: location ? { lat: location.lat, lng: location.lng } : null



        });



    };







    const handleGeneratePdf = async (action = 'download') => {



        const { jsPDF } = await import('jspdf');



        const html2canvas = (await import('html2canvas')).default;



        



        const input = reportRef.current;



        if (!input) return;







        try {



            const canvas = await html2canvas(input, { scale: 2 });



            const imgData = canvas.toDataURL('image/png');



            const pdf = new jsPDF('p', 'mm', 'a4');



            const pdfWidth = pdf.internal.pageSize.getWidth();



            const pdfHeight = pdf.internal.pageSize.getHeight();



            const canvasWidth = canvas.width;



            const canvasHeight = canvas.height;



            const ratio = canvasWidth / canvasHeight;



            const width = pdfWidth;



            const height = width / ratio;







            pdf.addImage(imgData, 'PNG', 0, 0, width, height > pdfHeight ? pdfHeight : height);



            



            if (action === 'preview') {



                window.open(pdf.output('bloburl'), '_blank');



            } else {



                pdf.save(`${sample.sampleCode}_분석결과서.pdf`);



            }



        } catch (error) {



            showMessage("PDF 생성에 실패했습니다.");



            console.error(error);



        }



    };







    const handleComplete = async () => {



        if (!signature) {



            showMessage("결과통보완료 버튼을 눌러 서명을 진행해주세요.");



            return;



        }



        setIsSubmitting(true);



        try {



            const fileURLs = await Promise.all(



                files.map(async (file) => {



                    const storageRef = ref(storage, `samples/${sample.sampleCode}/report_attachments/${file.name}`);



                    await uploadBytes(storageRef, file);



                    return await getDownloadURL(storageRef);



                })



            );







            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);



            const newHistoryEntry = {



                action: '결과통보',



                user: userData.name,



                userId: userData.uid,



                timestamp: Timestamp.now(),



                attachments: fileURLs,



                notificationDate,



                signature: {



                    user: signature.user,



                    datetime: signature.datetime.toISOString(),



                    gps: signature.gps ? `${signature.gps.lat}, ${signature.gps.lng}` : 'N/A'



                }



            };







            await updateDoc(sampleRef, {



                status: 'tech_review_wait',



                history: [...sample.history, newHistoryEntry]



            });







            showMessage("분석이 완료되어 '기술책임자 검토' 단계로 이동했습니다.");



            setSelectedSample(null);



        } catch (error) {



            showMessage(`처리 실패: ${error.message}`);



        } finally {



            setIsSubmitting(false);



        }



    };







    const registrationHistory = sample.history?.find(h => h.action === '시료접수');



    const receiveHistory = sample.history?.find(h => h.action === '시료수령');



    const prepHistory = sample.history?.find(h => h.action === '시료전처리');



    const analysisHistory = sample.history?.find(h => h.action === '분석');



    const evaluationHistory = sample.history?.find(h => h.action === '분석평가');







    return (



        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">



            {/* Hidden PDF Template */}



            <div style={{ position: 'absolute', left: '-9999px', width: '210mm', minHeight: '297mm', fontFamily: 'sans-serif', backgroundColor: 'white', color: 'black' }}>



                <div ref={reportRef} className="p-8">



                    <h1 className="text-2xl font-bold text-center my-6">(예비)방사능분석 결과서</h1>



                    <table className="w-full border-collapse border border-gray-400 text-sm">



                        <tbody>



                            <tr>



                                <td className="border border-gray-400 p-2 font-semibold bg-gray-100 w-1/4">품목명</td>



                                <td className="border border-gray-400 p-2" colSpan="3">{sample.itemName}</td>



                            </tr>



                            <tr>



                                <td className="border border-gray-400 p-2 font-semibold bg-gray-100">시료채취일</td>



                                <td className="border border-gray-400 p-2">{sample.datetime}</td>



                                <td className="border border-gray-400 p-2 font-semibold bg-gray-100">채취장소</td>



                                <td className="border border-gray-400 p-2">{sample.location}</td>



                            </tr>



                            <tr>



                                <td className="border border-gray-400 p-2 font-semibold bg-gray-100">계측시간</td>



                                <td className="border border-gray-400 p-2" colSpan="3">{analysisHistory?.measurementTime}</td>



                            </tr>



                            <tr>



                                <td className="border border-gray-400 p-2 font-semibold bg-gray-100 text-center" colSpan="4">핵종분석값 (Bq/kg)</td>



                            </tr>



                            <tr>



                                <td className="border border-gray-400 p-2 font-semibold bg-gray-100 text-center">핵종</td>



                                <td className="border border-gray-400 p-2 font-semibold bg-gray-100 text-center" colSpan="2">방사능 농도</td>



                                <td className="border border-gray-400 p-2 font-semibold bg-gray-100 text-center">불확도</td>



                            </tr>



                            {evaluationHistory?.results?.map((res, index) => (



                                <tr key={index}>



                                    <td className="border border-gray-400 p-2 text-center">{res.nuclide}</td>



                                    <td className="border border-gray-400 p-2 text-center" colSpan="2">{res.activity}</td>



                                    <td className="border border-gray-400 p-2 text-center">{res.isMda ? '-' : res.uncertainty}</td>



                                </tr>



                            ))}



                        </tbody>



                    </table>



                    <div className="mt-20">



                        <p className="text-lg text-right">발급년월일시: {new Date().toLocaleString()}</p>



                        <div className="flex justify-around mt-10">



                             <p className="text-xl">분석자: {analysisHistory?.signature?.user} (서명)</p>



                             <p className="text-xl">분석평가자: {evaluationHistory?.signature?.user} (서명)</p>



                        </div>



                    </div>



                </div>



            </div>







            <div>



                <button onClick={() => setSelectedSample(null)} className="mb-4 text-blue-600 hover:underline">← 목록으로</button>



                <h3 className="text-2xl font-bold">분석 완료: {sample.sampleCode}</h3>



            </div>







            <div className="border-t pt-4">



                <h4 className="text-lg font-semibold mb-2">시료 정보</h4>



                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">



                    <p><strong>시료 ID:</strong> {sample.sampleCode}</p>



                    <p><strong>시료분류:</strong> {sample.type}</p>



                    <p><strong>품목명:</strong> {sample.itemName}</p>



                    <p><strong>시료접수자:</strong> {sample.collectorName}</p>



                    <p><strong>연락처:</strong> {sample.collectorContact}</p>



                    <p><strong>접수검사소명:</strong> {sample.lab}</p>



                    <p><strong>시료채취일:</strong> {sample.datetime}</p>



                    <p><strong>채취장소:</strong> {sample.location}</p>



                    <p><strong>시료량:</strong> {sample.sampleAmount} kg</p>



                    <p><strong>시료조제무게:</strong> {prepHistory?.prepWeight || 'N/A'}</p>



                    <p><strong>분석유형:</strong> {sample.analysisType ? Object.entries(sample.analysisType).filter(([, val]) => val).map(([key]) => key).join(', ') : 'N/A'}</p>



                    <p><strong>계측일시:</strong> {analysisHistory?.measurementDateTime}</p>



                    <p><strong>계측시간:</strong> {analysisHistory?.measurementTime}</p>



                    <p><strong>장비코드:</strong> {analysisHistory?.equipmentCode}</p>



                    <p className="col-span-full"><strong>추가정보:</strong> {sample.etc || 'N/A'}</p>



                </div>



            </div>







            <div className="border-t pt-4">



                <h4 className="text-lg font-semibold mb-2">분석결과</h4>



                <div className="space-y-1 text-sm mb-4">



                    {evaluationHistory?.results?.map((res, index) => (



                        <p key={index}><strong>{res.nuclide}:</strong> {res.activity} {res.isMda ? '' : `± ${res.uncertainty}`} Bq/kg</p>



                    ))}



                </div>



                <div className="mt-4 flex gap-4">



                    <button onClick={() => handleGeneratePdf('preview')} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">결과서 미리보기</button>



                    <button onClick={() => handleGeneratePdf('download')} className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">결과서 PDF 다운로드</button>



                </div>



                <div className="mt-4 flex items-end gap-4">



                    <div>



                        <label htmlFor="notificationDate" className="block font-semibold text-sm mb-1">통보완료일시</label>



                        <input type="datetime-local" id="notificationDate" value={notificationDate} onChange={(e) => setNotificationDate(e.target.value)} className="p-2 border rounded-md w-full" />



                    </div>



                    {!signature && <button type="button" onClick={handleSign} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">결과통보완료</button>}



                </div>



            </div>







            <div className="border-t pt-4">



                <h4 className="text-lg font-semibold mb-2">레포트 파일(업로드) (최대 4건)</h4>



                <input type="file" multiple onChange={handleFileChange} accept="image/*,.pdf,.txt" className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>



            </div>







            <div className="border-t pt-4">



                <h4 className="text-lg font-semibold mb-2">전자결재</h4>



                <div className="border rounded-lg p-2 grid grid-cols-1 md:grid-cols-6 gap-1 divide-x divide-gray-200">



                    {[



                        { title: '시료접수자', history: registrationHistory },



                        { title: '시료수령자', history: receiveHistory },



                        { title: '전처리수행자', history: prepHistory },



                        { title: '분석수행자', history: analysisHistory },



                        { title: '분석평가자', history: evaluationHistory }



                    ].map(({ title, history }) => (



                        <div key={title} className="px-1">



                            <h5 className="font-semibold text-center mb-2 text-sm">{title}</h5>



                            {history?.signature ? (



                                <div className="mt-2 text-xs text-gray-600 space-y-1">



                                    <p><strong>서명자:</strong> {history.signature.user}</p>



                                    <p><strong>서명일시:</strong> {new Date(history.signature.datetime).toLocaleString()}</p>



                                    <p><strong>위치기록:</strong> {history.signature.gps}</p>



                                </div>



                            ) : <p className="text-xs text-gray-500 mt-2 text-center">정보 없음</p>}



                        </div>



                    ))}



                    <div className="px-1">



                        <h5 className="font-semibold text-center mb-2 text-sm">결과통보자</h5>



                        {signature ? (



                            <div className="mt-2 text-xs space-y-1">



                                <p><strong>서명자:</strong> {signature.user}</p>



                                <p><strong>서명일시:</strong> {signature.datetime.toLocaleString()}</p>



                                <p><strong>위치기록:</strong> {signature.gps ? `${signature.gps.lat.toFixed(5)}, ${signature.gps.lng.toFixed(5)}` : 'N/A'}</p>



                            </div>



                        ) : <p className="text-xs text-gray-500 mt-2 text-center">대기중</p>}



                    </div>



                </div>



            </div>







            <button onClick={handleComplete} disabled={isSubmitting || !signature} className="mt-6 w-full bg-purple-600 text-white font-bold py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed">



                {isSubmitting ? '처리 중...' : '기술책임자 검토요청'}



            </button>



        </div>



    );



}



















const InputField = ({ label, name, value, onChange, type = "text", disabled = false }) => (



















    <div>



















        <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>



















        <input



















            type={type}



















            id={name}



















            name={name}



















            value={value || ''}



















            onChange={onChange}



















            disabled={disabled}



















            className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm disabled:bg-gray-100"



















        />



















    </div>



















);







































function SampleTechReviewScreen({ sample, userData, location, setSelectedSample, showMessage }) {



















    const [formData, setFormData] = useState({ ...sample });



















    const [signature, setSignature] = useState(null);



















    const [isSubmitting, setIsSubmitting] = useState(false);







































    const handleInputChange = (e) => {



















        const { name, value } = e.target;



















        setFormData(prev => ({ ...prev, [name]: value }));



















    };







































    const handleSign = () => {



















        setSignature({



















            user: userData.name,



















            datetime: new Date(),



















            gps: location ? { lat: location.lat, lng: location.lng } : null



















        });



















    };







































    const handleSubmit = async (e) => {



















        e.preventDefault();



















        if (!signature) {



















            showMessage("전자결재 서명을 진행해주세요.");



















            return;



















        }



















        setIsSubmitting(true);







































        try {



















            const changes = Object.keys(formData).reduce((acc, key) => {



















                if (formData[key] !== sample[key]) {



















                    acc.push({ field: key, oldValue: sample[key], newValue: formData[key] });



















                }



















                return acc;



















            }, []);







































            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);



















            const newHistoryEntry = {



















                action: '기술책임자검토',



















                user: userData.name,



















                userId: userData.uid,



















                timestamp: Timestamp.now(),



















                changes: changes,



















                signature: {



















                    user: signature.user,



















                    datetime: signature.datetime.toISOString(),



















                    gps: signature.gps ? `${signature.gps.lat}, ${signature.gps.lng}` : 'N/A'



















                }



















            };







































            await updateDoc(sampleRef, {



















                ...formData,



















                status: 'assoc_review_wait',



















                history: [...sample.history, newHistoryEntry]



















            });







































            showMessage('기술 책임자 검토가 완료되었습니다.');



















            setSelectedSample(null);







































        } catch (error) {



















            showMessage(`기술 책임자 검토 처리에 실패했습니다: ${error.message}`);



















        } finally {



















            setIsSubmitting(false);



















        }



















    };







































    const history = {



















        receipt: sample.history?.find(h => h.action === '시료접수'),



















        receive: sample.history?.find(h => h.action === '시료수령'),



















        prep: sample.history?.find(h => h.action === '시료전처리'),



















        analysis: sample.history?.find(h => h.action === '분석'),



















        evaluation: sample.history?.find(h => h.action === '분석평가'),



















        notification: sample.history?.find(h => h.action === '결과통보'),



















    };







































    const PhotoGallery = ({ title, photos }) => (



















        <div>



















            <h5 className="font-semibold text-gray-600">{title}</h5>



















            <div className="flex gap-4 mt-2">



















                {photos && photos.length > 0 ? photos.map((photo, index) => (



















                    <a key={index} href={photo} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">사진 {index + 1}</a>



















                )) : <span className="text-sm text-gray-500">사진 없음</span>}



















            </div>



















        </div>



















    );







































    return (



















        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">



















            <div>



















                <button onClick={() => setSelectedSample(null)} className="mb-4 text-blue-600 hover:underline">← 목록으로</button>



















                <h3 className="text-2xl font-bold">기술 책임자 검토: {sample.sampleCode}</h3>



















            </div>







































            <form onSubmit={handleSubmit} className="space-y-8">



















                <div className="border-t pt-4">



















                    <h4 className="text-lg font-semibold mb-4">시료 정보 (수정 가능)</h4>



















                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">



















                        <InputField label="시료 ID" name="sampleCode" value={formData.sampleCode} onChange={handleInputChange} disabled />



















                        <InputField label="시료분류" name="type" value={formData.type} onChange={handleInputChange} />



















                        <InputField label="품목명" name="itemName" value={formData.itemName} onChange={handleInputChange} />



















                        <InputField label="시료접수자" name="collectorName" value={formData.collectorName} onChange={handleInputChange} />



















                        <InputField label="연락처" name="collectorContact" value={formData.collectorContact} onChange={handleInputChange} />



















                        <InputField label="접수검사소명" name="lab" value={formData.lab} onChange={handleInputChange} />



















                        <InputField label="시료채취일" name="datetime" type="datetime-local" value={formData.datetime} onChange={handleInputChange} />



















                        <InputField label="채취장소" name="location" value={formData.location} onChange={handleInputChange} />



















                        <InputField label="시료량 (kg)" name="sampleAmount" value={formData.sampleAmount} onChange={handleInputChange} />



















                        <div className="md:col-span-3">



















                            <label className="block text-sm font-medium text-gray-700">추가정보</label>



















                            <textarea name="etc" value={formData.etc} onChange={handleInputChange} rows="3" className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"></textarea>



















                        </div>



















                    </div>



















                </div>







































                <div className="border-t pt-4 space-y-4">



















                    <h4 className="text-lg font-semibold mb-4">사진 정보</h4>



















                    <PhotoGallery title="시료채취사진" photos={[sample.photos?.photo1, sample.photos?.photo2].filter(Boolean)} />



















                    <PhotoGallery title="시료인수사진" photos={history.receive?.photos} />



















                    <PhotoGallery title="시료전처리사진" photos={history.prep?.photos} />



















                </div>







































                <div className="border-t pt-4">



















                    <h4 className="text-lg font-semibold mb-4">분석 정보</h4>



















                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">



















                        <InputField label="장비ID" name="equipmentCode" value={history.analysis?.equipmentCode || ''} disabled />



















                        <InputField label="계측일시" name="measurementDateTime" value={history.analysis?.measurementDateTime || ''} disabled />



















                        <InputField label="계측시간" name="measurementTime" value={history.analysis?.measurementTime || ''} disabled />



















                        <InputField label="결과통보일시" name="notificationDate" value={history.notification?.notificationDate || ''} disabled />



















                    </div>



















                     {sample.reportUrl && (



















                        <div className="mt-4">



















                            <a href={sample.reportUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">업로드된 레포트 보기</a>



















                        </div>



















                    )}



















                </div>







































                <div className="border-t pt-4">



















                    <h4 className="text-lg font-semibold mb-2">전자결재</h4>



















                     <div className="border rounded-lg p-4">



















                        <h5 className="font-semibold text-center mb-2">기술 책임자</h5>



















                        {signature ? (



















                            <div className="mt-2 text-sm text-center">



















                                <p><strong>서명자:</strong> {signature.user}</p>



















                                <p><strong>서명일시:</strong> {signature.datetime.toLocaleString()}</p>



















                                <p><strong>위치기록:</strong> {signature.gps ? `${signature.gps.lat.toFixed(5)}, ${signature.gps.lng.toFixed(5)}` : 'N/A'}</p>



















                            </div>



















                        ) : (



















                            <div className="mt-2 text-center">



















                                <button type="button" onClick={handleSign} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">서명하기</button>



















                            </div>



















                        )}



















                    </div>



















                </div>







































                <button type="submit" disabled={isSubmitting || !signature} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">



















                    {isSubmitting ? '검토 완료' : '검토 완료'}



















                </button>



















            </form>



















        </div>



















    );



















}















function SampleAssocReviewScreen({ sample, userData, location, setSelectedSample, showMessage }) {















    const [formData, setFormData] = useState({ ...sample });















    const [reportFile, setReportFile] = useState(null);















    const [certificateFile, setCertificateFile] = useState(null);















    const [signature, setSignature] = useState(null);















    const [isSubmitting, setIsSubmitting] = useState(false);































    const handleInputChange = (e) => {















        const { name, value } = e.target;















        setFormData(prev => ({ ...prev, [name]: value }));















    };































    const handleFileChange = (e, fileType) => {















        if (e.target.files[0]) {















            if (fileType === 'report') setReportFile(e.target.files[0]);















            if (fileType === 'certificate') setCertificateFile(e.target.files[0]);















        }















    };































    const handleSign = () => {















        setSignature({















            user: userData.name,















            datetime: new Date(),















            gps: location ? { lat: location.lat, lng: location.lng } : null















        });















    };































        const handleSubmit = async (e) => {































            e.preventDefault();































            if (!signature) {































                showMessage("전자결재 서명을 진행해주세요.");































                return;































            }































            setIsSubmitting(true);































            try {































                let reportUrl = sample.reportUrl || null;































                let certificateUrl = sample.certificateUrl || null;































    































                if (reportFile) {































                    const reportRef = ref(storage, `samples/${sample.sampleCode}/reports/${reportFile.name}`);































                    await uploadBytes(reportRef, reportFile);































                    reportUrl = await getDownloadURL(reportRef);































                }































                if (certificateFile) {































                    const certRef = ref(storage, `samples/${sample.sampleCode}/certificates/${certificateFile.name}`);































                    await uploadBytes(certRef, certificateFile);































                    certificateUrl = await getDownloadURL(certRef);































                }































            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);















            const newHistoryEntry = {















                action: '협회검토',















                user: userData.name,















                userId: userData.uid,















                timestamp: Timestamp.now(),















                signature: {















                    user: signature.user,















                    datetime: signature.datetime.toISOString(),















                    gps: signature.gps ? `${signature.gps.lat}, ${signature.gps.lng}` : 'N/A'















                }















            };































            await updateDoc(sampleRef, {















                ...formData,















                reportUrl,















                certificateUrl,















                status: 'complete',















                history: [...sample.history, newHistoryEntry]















            });































            showMessage('협회 검토가 완료되고 시료 상태가 최종 완료로 변경되었습니다.');















            setSelectedSample(null);































        } catch (error) {















            showMessage(`협회 검토 처리에 실패했습니다: ${error.message}`);















        } finally {















            setIsSubmitting(false);















        }















    };















    















    const history = {















        receipt: sample.history?.find(h => h.action === '시료접수'),















        receive: sample.history?.find(h => h.action === '시료수령'),















        prep: sample.history?.find(h => h.action === '시료전처리'),















        analysis: sample.history?.find(h => h.action === '분석'),















        evaluation: sample.history?.find(h => h.action === '분석평가'),















        notification: sample.history?.find(h => h.action === '결과통보'),















        techReview: sample.history?.find(h => h.action === '기술책임자검토'),















    };































    const PhotoGallery = ({ title, photos }) => (















        <div>















            <h5 className="font-semibold text-gray-600">{title}</h5>















            <div className="flex gap-4 mt-2">















                {photos && photos.length > 0 ? photos.map((photo, index) => (















                    <a key={index} href={photo} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">사진 {index + 1}</a>















                )) : <span className="text-sm text-gray-500">사진 없음</span>}















            </div>















        </div>















    );















    















    const SignatureDisplay = ({ title, signature }) => (















        <div className="px-2">















            <h5 className="font-semibold text-center mb-2">{title}</h5>















            {signature ? (















                <div className="mt-2 text-xs text-gray-600 space-y-1 text-center">















                    <p><strong>서명자:</strong> {signature.user}</p>















                    <p><strong>서명일시:</strong> {new Date(signature.datetime).toLocaleString()}</p>















                    <p><strong>위치:</strong> {signature.gps || 'N/A'}</p>















                </div>















            ) : <p className="text-xs text-gray-500 mt-2 text-center">서명 없음</p>}















        </div>















    );































    return (















        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">















            <div>















                <button onClick={() => setSelectedSample(null)} className="mb-4 text-blue-600 hover:underline">← 목록으로</button>















                <h3 className="text-2xl font-bold">협회 검토: {sample.sampleCode}</h3>















            </div>































            <form onSubmit={handleSubmit} className="space-y-8">















                {/* 시료 정보 */}















                <div className="border-t pt-4">















                    <h4 className="text-lg font-semibold mb-4">시료 정보</h4>















                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">















                        <InputField label="시료 ID" name="sampleCode" value={formData.sampleCode} onChange={handleInputChange} disabled />















                        <InputField label="시료분류" name="type" value={formData.type} onChange={handleInputChange} />















                        <InputField label="품목명" name="itemName" value={formData.itemName} onChange={handleInputChange} />















                        <InputField label="시료접수자" name="collectorName" value={formData.collectorName} onChange={handleInputChange} />















                        <InputField label="연락처" name="collectorContact" value={formData.collectorContact} onChange={handleInputChange} />















                        <InputField label="접수검사소명" name="lab" value={formData.lab} onChange={handleInputChange} />















                        <InputField label="시료채취일" name="datetime" type="datetime-local" value={formData.datetime} onChange={handleInputChange} />















                        <InputField label="채취장소" name="location" value={formData.location} onChange={handleInputChange} />















                        <InputField label="시료량 (kg)" name="sampleAmount" value={formData.sampleAmount} onChange={handleInputChange} />















                        <div className="md:col-span-3">















                            <label className="block text-sm font-medium text-gray-700">추가정보</label>















                            <textarea name="etc" value={formData.etc} onChange={handleInputChange} rows="3" className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"></textarea>















                        </div>















                    </div>















                </div>































                {/* 사진 정보 */}















                <div className="border-t pt-4 space-y-4">















                     <h4 className="text-lg font-semibold mb-4">사진 정보</h4>















                    <PhotoGallery title="시료채취사진" photos={[sample.photos?.photo1, sample.photos?.photo2].filter(Boolean)} />















                    <PhotoGallery title="시료인수사진" photos={history.receive?.photos} />















                    <PhotoGallery title="시료전처리사진" photos={history.prep?.photos} />















                </div>































                {/* 분석 정보 */}















                <div className="border-t pt-4">















                    <h4 className="text-lg font-semibold mb-4">분석 정보</h4>















                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">















                        <InputField label="장비ID" name="equipmentCode" value={history.analysis?.equipmentCode || ''} disabled />















                        <InputField label="계측일시" name="measurementDateTime" value={history.analysis?.measurementDateTime || ''} disabled />















                        <InputField label="계측시간" name="measurementTime" value={history.analysis?.measurementTime || ''} disabled />















                        <InputField label="결과통보일시" name="notificationDate" value={history.notification?.notificationDate || ''} disabled />















                    </div>















                </div>















                















                {/* 레포트 및 성적서 */}















                <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">















                    <div>















                        <h4 className="text-lg font-semibold mb-2">레포트</h4>















                        <input type="file" onChange={(e) => handleFileChange(e, 'report')} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>















                        {sample.reportUrl && !reportFile && <a href={sample.reportUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline mt-2 block">기존 레포트 보기</a>}















                    </div>















                    <div>















                        <h4 className="text-lg font-semibold mb-2">성적서</h4>















                        <input type="file" onChange={(e) => handleFileChange(e, 'certificate')} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"/>















                        {sample.certificateUrl && !certificateFile && <a href={sample.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline mt-2 block">기존 성적서 보기</a>}















                    </div>















                </div>















                















                {/* 기술책임자 수정 내역 */}















                {history.techReview?.changes?.length > 0 && (















                    <div className="border-t pt-4">















                        <h4 className="text-lg font-semibold mb-2">기술책임자 수정 내역</h4>















                        <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">















                            {history.techReview.changes.map((change, index) => (















                                <li key={index}><strong>{change.field}:</strong> "{change.oldValue}" → "{change.newValue}"</li>















                            ))}















                        </ul>















                    </div>















                )}































                {/* 전자결재 */}















                <div className="border-t pt-4">















                    <h4 className="text-lg font-semibold mb-2">전자결재</h4>















                    <div className="border rounded-lg p-2 grid grid-cols-4 gap-2 divide-x divide-gray-200">















                        <SignatureDisplay title="시료접수자" signature={history.receipt?.signature} />















                        <SignatureDisplay title="시료수령자" signature={history.receive?.signature} />















                        <SignatureDisplay title="전처리수행자" signature={history.prep?.signature} />















                        <SignatureDisplay title="분석수행자" signature={history.analysis?.signature} />















                        <SignatureDisplay title="분석평가자" signature={history.evaluation?.signature} />















                        <SignatureDisplay title="결과통보자" signature={history.notification?.signature} />















                        <SignatureDisplay title="기술책임자" signature={history.techReview?.signature} />















                        <div className="px-2">















                            <h5 className="font-semibold text-center mb-2">협회 검토자</h5>















                            {signature ? (















                                <div className="mt-2 text-sm text-center">















                                    <p><strong>서명자:</strong> {signature.user}</p>















                                    <p><strong>서명일시:</strong> {signature.datetime.toLocaleString()}</p>















                                    <p><strong>위치:</strong> {signature.gps ? `${signature.gps.lat.toFixed(5)}, ${signature.gps.lng.toFixed(5)}` : 'N/A'}</p>















                                </div>















                            ) : (















                                <div className="mt-2 text-center">















                                    <button type="button" onClick={handleSign} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">서명하기</button>















                                </div>















                            )}















                        </div>















                    </div>















                </div>































                <button type="submit" disabled={isSubmitting || !signature} className="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400">















                    {isSubmitting ? '처리 중...' : '최종완료'}















                </button>















            </form>















        </div>















    );















}















function ControlDashboard({ userData }) {

    const [notices, setNotices] = useState([]);

    const [isLoading, setIsLoading] = useState(true);
    const [selectedNotice, setSelectedNotice] = useState(null);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const noticesRef = collection(db, `/artifacts/${appId}/public/data/notices`);
        const q = query(noticesRef, orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setNotices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLoading(false);
        }, (error) => {
            setMessage("공지사항을 불러오는 데 실패했습니다.");
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (isLoading) return <div>공지사항을 불러오는 중...</div>;

    if (selectedNotice) {
        return (
            <div>
                <button onClick={() => setSelectedNotice(null)} className="mb-4 text-blue-600 hover:underline">← 목록으로</button>
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-2xl font-bold">{selectedNotice.title}</h2>
                    <p className="text-sm text-gray-500 my-2">작성자: {selectedNotice.authorName} | 작성일: {selectedNotice.createdAt.toDate().toLocaleDateString()}</p>
                    <hr className="my-4"/>
                    <p className="whitespace-pre-wrap">{selectedNotice.content}</p>
                    {selectedNotice.attachments && selectedNotice.attachments.map((att, index) => (
                        <a key={index} href={att.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline mt-6 block">첨부파일 {index + 1}: {att.name}</a>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">공지사항</h2>
            </div>
            {message && <p className="p-3 rounded-lg mb-4 bg-blue-100 text-blue-800">{message}</p>}
            <div className="bg-white shadow-md rounded-lg"><ul className="divide-y divide-gray-200">
                {notices.map(notice => (
                    <li key={notice.id} onClick={() => setSelectedNotice(notice)} className="p-4 hover:bg-gray-50 cursor-pointer">
                        <p className="font-semibold">{notice.title}</p>
                        <p className="text-sm text-gray-600">{notice.authorName} - {notice.createdAt.toDate().toLocaleDateString()}</p>
                    </li>
                ))}
            </ul></div>
        </div>
    );
}

function AnalysisExperienceDetails({ analysisExperience }) {
    if (!analysisExperience || analysisExperience.length === 0) {
        return <p>N/A</p>;
    }

    return (
        <div className="space-y-2">
            {analysisExperience.map((exp, index) => (
                <div key={index} className="p-2 border rounded-md bg-white">
                    <p><strong>경력내용:</strong> {exp.details}</p>
                    <p><strong>근무처:</strong> {exp.workplace}</p>
                    <p><strong>근무기간:</strong> {exp.startDate} ~ {exp.endDate || '현재 근무중'} ({exp.totalMonths}개월)</p>
                </div>
            ))}
        </div>
    );
}

function TrainingHistoryDetails({ trainingHistory }) {
    if (!trainingHistory || trainingHistory.length === 0) {
        return <p>N/A</p>;
    }

    return (
        <div className="space-y-2">
            {trainingHistory.map((training, index) => (
                <div key={index} className="p-2 border rounded-md bg-white">
                    <p><strong>교육명:</strong> {training.courseName}</p>
                    <p><strong>교육기관:</strong> {training.institution}</p>
                    <p><strong>교육기간:</strong> {training.startDate} ~ {training.endDate} ({training.totalHours}시간)</p>
                </div>
            ))}
        </div>
    );
}

function AnalysisExperienceForm({ analysisExperience, setAnalysisExperience }) {
    const [details, setDetails] = useState('');
    const [workplace, setWorkplace] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isCurrent, setIsCurrent] = useState(false);

    const handleAdd = () => {
        if (!details || !workplace || !startDate) return;

        const newExperience = {
            id: Date.now(),
            details,
            workplace,
            startDate,
            endDate: isCurrent ? null : endDate,
            totalMonths: calculateMonths(startDate, isCurrent ? null : endDate),
        };
        setAnalysisExperience([...analysisExperience, newExperience]);
        setDetails('');
        setWorkplace('');
        setStartDate('');
        setEndDate('');
        setIsCurrent(false);
    };

    const handleDelete = (id) => {
        setAnalysisExperience(analysisExperience.filter(exp => exp.id !== id));
    };

    const calculateMonths = (start, end) => {
        const startDate = new Date(start);
        const endDate = end ? new Date(end) : new Date();
        if (isNaN(startDate.getTime())) return 0;

        let months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
        months -= startDate.getMonth();
        months += endDate.getMonth();
        return months <= 0 ? 0 : months;
    };

    return (
        <div className="p-4 border rounded-lg mt-4">
            <h4 className="font-semibold">방사능분석 경력</h4>
            <div className="space-y-2 mb-4">
                {analysisExperience.map(exp => (
                    <div key={exp.id} className="flex items-center justify-between p-2 border rounded-md">
                        <div>
                            <p><strong>{exp.details}</strong> @ {exp.workplace}</p>
                            <p className="text-sm">{exp.startDate} ~ {exp.endDate || '현재'}</p>
                        </div>
                        <button type="button" onClick={() => handleDelete(exp.id)} className="text-red-500">삭제</button>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input type="text" value={details} onChange={e => setDetails(e.target.value)} placeholder="경력내용" className="w-full p-2 border rounded-md" />
                <input type="text" value={workplace} onChange={e => setWorkplace(e.target.value)} placeholder="근무처" className="w-full p-2 border rounded-md" />
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} placeholder="근무시작일" className="w-full p-2 border rounded-md" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} placeholder="근무종료일" disabled={isCurrent} className="w-full p-2 border rounded-md" />
            </div>
            <div className="flex items-center mt-2">
                <input type="checkbox" checked={isCurrent} onChange={e => setIsCurrent(e.target.checked)} id="isCurrent" className="mr-2" />
                <label htmlFor="isCurrent">현재 계속 근무</label>
            </div>
            <button type="button" onClick={handleAdd} className="mt-2 bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">추가</button>
        </div>
    );
}

function TrainingHistoryForm({ trainingHistory, setTrainingHistory }) {
    const [courseName, setCourseName] = useState('');
    const [institution, setInstitution] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [totalHours, setTotalHours] = useState('');

    const handleAdd = () => {
        if (!courseName || !institution || !startDate || !endDate || !totalHours) return;
        const newTraining = {
            id: Date.now(),
            courseName,
            institution,
            startDate,
            endDate,
            totalHours,
        };
        setTrainingHistory([...trainingHistory, newTraining]);
        setCourseName('');
        setInstitution('');
        setStartDate('');
        setEndDate('');
        setTotalHours('');
    };

    const handleDelete = (id) => {
        setTrainingHistory(trainingHistory.filter(item => item.id !== id));
    };

    return (
        <div className="p-4 border rounded-lg mt-4">
            <h4 className="font-semibold">교육 이력</h4>
            <div className="space-y-2 mb-4">
                {trainingHistory.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2 border rounded-md">
                        <div>
                            <p><strong>{item.courseName}</strong> @ {item.institution}</p>
                            <p className="text-sm">{item.startDate} ~ {item.endDate} ({item.totalHours}시간)</p>
                        </div>
                        <button type="button" onClick={() => handleDelete(item.id)} className="text-red-500">삭제</button>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input type="text" value={courseName} onChange={e => setCourseName(e.target.value)} placeholder="교육명" className="w-full p-2 border rounded-md" />
                <input type="text" value={institution} onChange={e => setInstitution(e.target.value)} placeholder="교육기관" className="w-full p-2 border rounded-md" />
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} placeholder="교육시작일" className="w-full p-2 border rounded-md" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} placeholder="교육종료일" className="w-full p-2 border rounded-md" />
                <input type="number" value={totalHours} onChange={e => setTotalHours(e.target.value)} placeholder="총 이수시간" className="w-full p-2 border rounded-md" />
            </div>
            <button type="button" onClick={handleAdd} className="mt-2 bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">추가</button>
        </div>
    );
}

function UserManagement() {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [message, setMessage] = useState('');
    const [uploadFile, setUploadFile] = useState(null);
    const [expandedUserId, setExpandedUserId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const usersRef = collection(db, `/artifacts/${appId}/public/data/users`);
        const unsubscribe = onSnapshot(query(usersRef, orderBy("name")), (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLoading(false);
        });
        return unsubscribe;
    }, []);

    const handleEdit = (user) => { setMessage(''); setEditingUser(user); setIsModalOpen(true); };
    const handleAddNew = () => { setMessage(''); setEditingUser(null); setIsModalOpen(true); };
    const handleCloseModal = (successMessage = '') => { setIsModalOpen(false); setEditingUser(null); if (successMessage) setMessage(successMessage); };
    
    const handlePasswordReset = async (email) => {
        setMessage('');
        try {
            await sendPasswordResetEmail(auth, email);
            setMessage(`비밀번호 재설정 이메일을 ${email}로 성공적으로 발송했습니다.`);
        } catch (error) {
            setMessage(`이메일 발송에 실패했습니다: ${error.message}`);
        }
    };

    const userFields = [
        { label: '이름', key: 'name' }, { label: '이메일', key: 'email' }, { label: '연락처', key: 'contact' }, { label: '소속', key: 'organization' }, 
        { label: '직급', key: 'position' }, { label: '자격 등급', key: 'qualificationLevel' }, { label: '생년월일', key: 'birthdate' }, 
        { label: '최종학력', key: 'finalEducation' }, { label: '전공', key: 'major' }, { label: '검사소', key: 'inspectionOffice' },
        { label: '분석기관', key: 'analysisAgency' },
        { label: '프로필사진', key: 'profilePictureUrl' },
        { label: '서명이미지', key: 'signatureUrl' }
    ];

    const handleDownloadData = () => {
        const dataToExport = users.map(user => {
            let row = {};
            userFields.forEach(field => { 
                const value = user[field.key];
                row[field.label] = Array.isArray(value) ? value.join(', ') : value || ''; 
            });
            return row;
        });
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
        XLSX.writeFile(workbook, "사용자_목록.xlsx");
    };

    const handleDownloadTemplate = () => {
        const headers = [userFields.map(f => f.label)];
        const worksheet = XLSX.utils.aoa_to_sheet(headers);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
        XLSX.writeFile(workbook, "사용자_업로드_템플릿.xlsx");
    };

    const handleExcelUpload = () => {
        if (!uploadFile) return;
        const confirmation = window.confirm("엑셀 파일로 사용자 정보를 업데이트합니다. 이메일 주소가 일치하는 사용자의 정보가 덮어쓰기됩니다. 계속하시겠습니까?");
        if (!confirmation) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                if (json.length === 0) { setMessage("엑셀 파일에 데이터가 없습니다."); return; }

                setMessage("업로드 및 업데이트 시작...");
                const updatePromises = [];
                const labelToKey = userFields.reduce((acc, field) => ({ ...acc, [field.label]: field.key }), {});

                json.forEach(row => {
                    const email = row['이메일'];
                    if (!email) return;
                    const userToUpdate = users.find(u => u.email === email);
                    if (userToUpdate) {
                        const newUserData = {};
                        for (const label in row) {
                            const key = labelToKey[label];
                            if (key && key !== 'email') {
                                if (key === 'inspectionOffice' || key === 'analysisAgency') {
                                    newUserData[key] = row[label] ? row[label].split(',').map(s => s.trim()) : [];
                                } else {
                                    newUserData[key] = row[label];
                                }
                            }
                        }
                        updatePromises.push(updateDoc(doc(db, `/artifacts/${appId}/public/data/users`, userToUpdate.id), newUserData));
                    }
                });

                await Promise.all(updatePromises);
                setMessage(`${updatePromises.length}명의 사용자 정보가 성공적으로 업데이트되었습니다.`);
            } catch (error) {
                setMessage(`엑셀 업로드 실패: ${error.message}`);
            }
        };
        reader.readAsArrayBuffer(uploadFile);
    };

    if (isLoading) return <div>사용자 목록을 불러오는 중...</div>;

    const filteredUsers = users.filter(user => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        return (
            user.name.toLowerCase().includes(lowerCaseSearchTerm) ||
            user.email.toLowerCase().includes(lowerCaseSearchTerm) ||
            user.organization.toLowerCase().includes(lowerCaseSearchTerm) ||
            user.qualificationLevel.toLowerCase().includes(lowerCaseSearchTerm)
        );
    });

    return (
        <div>
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h2 className="text-2xl font-bold">회원 관리</h2>
                <div className="flex items-center gap-2">
                    <span className="text-gray-700 font-semibold">검색</span>
                    <input type="text" placeholder="이름, 이메일, 소속 등으로 검색" className="p-2 border rounded-md flex-grow max-w-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={handleDownloadTemplate} className="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600">엑셀 템플릿</button>
                    <button onClick={handleDownloadData} className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">엑셀 다운로드</button>
                    <div className="flex items-center gap-2 border p-2 rounded-lg">
                        <input type="file" accept=".xlsx, .xls" onChange={(e) => setUploadFile(e.target.files[0])} className="text-sm"/>
                        <button onClick={handleExcelUpload} disabled={!uploadFile} className="bg-purple-600 text-white font-bold py-1 px-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400">업로드</button>
                    </div>
                    <button onClick={handleAddNew} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">신규 회원 추가</button>
                </div>
            </div>
            {message && <p className={`p-3 rounded-lg mb-4 ${message.includes('실패') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{message}</p>}
            {isModalOpen && <UserModal user={editingUser} onClose={handleCloseModal} />}
            
            <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden"><table className="min-w-full leading-normal">
                <thead><tr>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase"> </th>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase">이름</th>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase">이메일</th>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase">연락처</th>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase">소속</th>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase">자격 등급</th>
                    <th className="px-5 py-3 border-b-2"></th>
                </tr></thead>
                <tbody>{filteredUsers.map(user => (
                    <React.Fragment key={user.id}>
                        <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}>
                            <td className="px-5 py-5 border-b text-sm">{expandedUserId === user.id ? '▼' : '▶'}</td>
                            <td className="px-5 py-5 border-b text-sm">{user.name}</td>
                            <td className="px-5 py-5 border-b text-sm">{user.email}</td>
                            <td className="px-5 py-5 border-b text-sm">{user.contact}</td>
                            <td className="px-5 py-5 border-b text-sm">{user.organization}</td>
                            <td className="px-5 py-5 border-b text-sm">{user.qualificationLevel}</td>
                            <td className="px-5 py-5 border-b text-sm text-right">
                                <button onClick={(e) => { e.stopPropagation(); handleEdit(user); }} className="text-indigo-600 hover:text-indigo-900 mr-4">수정</button>
                                <button onClick={(e) => { e.stopPropagation(); handlePasswordReset(user.email);}} className="text-red-600 hover:text-red-900">비밀번호 초기화</button>
                            </td>
                        </tr>
                        {expandedUserId === user.id && (
                            <tr>
                                <td colSpan="6" className="p-5 bg-gray-100">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {userFields.map(field => (
                                            <div key={field.key} className="py-1">
                                                <span className="font-semibold">{field.label}: </span>
                                                {field.key === 'profilePictureUrl' ? 
                                                    (user.profilePictureUrl ? <img src={user.profilePictureUrl} alt="Profile" className="w-24 h-24 rounded-full object-cover" /> : 'N/A') :
                                                    (field.key === 'signatureUrl' ?
                                                        (user.signatureUrl ? <img src={user.signatureUrl} alt="Signature" className="w-24 h-24 object-contain" /> : 'N/A') :
                                                        <span>{Array.isArray(user[field.key]) ? user[field.key].join(', ') : user[field.key] || 'N/A'}</span>
                                                    )
                                                }
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4">
                                        <h4 className="font-semibold text-lg mb-2">방사능분석 경력</h4>
                                        <AnalysisExperienceDetails analysisExperience={user.analysisExperience} />
                                    </div>
                                    <div className="mt-4">
                                        <h4 className="font-semibold text-lg mb-2">교육 이력</h4>
                                        <TrainingHistoryDetails trainingHistory={user.trainingHistory} />
                                    </div>
                                </td>
                            </tr>
                        )}
                    </React.Fragment>
                ))}
                </tbody>
            </table></div>
        </div>
    );
}

function UserModal({ user, onClose }) {
    const isEditing = user !== null;
    const [formData, setFormData] = useState({ email: user?.email || '', password: '', name: user?.name || '', contact: user?.contact || '', organization: user?.organization || '', position: user?.position || '', qualificationLevel: user?.qualificationLevel || '분석원', birthdate: user?.birthdate || '', finalEducation: user?.finalEducation || '', major: user?.major || '', inspectionOffice: user?.inspectionOffice || [] });
    const [analysisExperience, setAnalysisExperience] = useState(user?.analysisExperience || []);
    const [trainingHistory, setTrainingHistory] = useState(user?.trainingHistory || []);
    const [photoFile, setPhotoFile] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(user?.profilePictureUrl || null);
    const [signatureFile, setSignatureFile] = useState(null);
    const [signaturePreview, setSignaturePreview] = useState(user?.signatureUrl || null);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const qualificationLevels = ['시료채취원', '기술책임자', '분석원', '분석보조원', '관리자', '해수부', '협회'];
    const [inspectionOffices, setInspectionOffices] = useState([]);
    const [analysisAgencies, setAnalysisAgencies] = useState([]);

    useEffect(() => {
        const fetchSelectData = async () => {
            try {
                const officesSnapshot = await getDocs(collection(db, `/artifacts/${appId}/public/data/inspection_offices`));
                setInspectionOffices(officesSnapshot.docs.map(doc => doc.data().name));

                const agenciesSnapshot = await getDocs(collection(db, `/artifacts/${appId}/public/data/analysis_agencies`));
                setAnalysisAgencies(agenciesSnapshot.docs.map(doc => doc.data().name));
            } catch (err) {
                setError("검사소 또는 분석기관 목록을 불러오는 데 실패했습니다.");
            }
        };
        fetchSelectData();
    }, []);

    const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
    const handleMultiSelectChange = (e) => {
        const { name, options } = e.target;
        const value = [];
        for (let i = 0, l = options.length; i < l; i++) {
            if (options[i].selected) {
                value.push(options[i].value);
            }
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    const handlePhotoChange = (e) => { const file = e.target.files[0]; if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); } };
    const handleSignatureChange = (e) => { const file = e.target.files[0]; if (file) { setSignatureFile(file); setSignaturePreview(URL.createObjectURL(file)); } };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!isEditing && !formData.password) { setError("신규 사용자는 비밀번호를 입력해야 합니다."); return; }
        setIsSubmitting(true);
        try {
            let userId = user?.id;
            let profilePictureUrl = user?.profilePictureUrl || '';
            let signatureUrl = user?.signatureUrl || '';
            const uploadAndGetURL = async (uid, file, path) => { const storageRef = ref(storage, `${path}/${uid}`); await uploadBytes(storageRef, file); return await getDownloadURL(storageRef); };

            const dataToSave = { ...formData, profilePictureUrl, signatureUrl, analysisExperience, trainingHistory };

            if (isEditing) {
                if (photoFile) dataToSave.profilePictureUrl = await uploadAndGetURL(userId, photoFile, 'profile_pictures');
                if (signatureFile) dataToSave.signatureUrl = await uploadAndGetURL(userId, signatureFile, 'signatures');
                const { email, password, ...updateData } = dataToSave;
                await updateDoc(doc(db, `/artifacts/${appId}/public/data/users`, userId), updateData);
                onClose("사용자 정보가 성공적으로 수정되었습니다.");
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                userId = userCredential.user.uid;
                if (photoFile) dataToSave.profilePictureUrl = await uploadAndGetURL(userId, photoFile, 'profile_pictures');
                if (signatureFile) dataToSave.signatureUrl = await uploadAndGetURL(userId, signatureFile, 'signatures');
                const { password, ...userDataToSave } = dataToSave;
                await setDoc(doc(db, `/artifacts/${appId}/public/data/users`, userId), { ...userDataToSave, uid: userId });
                onClose("신규 사용자가 성공적으로 추가되었습니다.");
            }
        } catch (error) {
            setError(`작업에 실패했습니다: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg"><h3 className="text-xl font-bold mb-6">{isEditing ? '회원 정보 수정' : '신규 회원 추가'}</h3>{error && <p className="text-red-500 text-sm bg-red-100 p-2 rounded mb-4">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="flex items-center gap-4">
                    <img src={photoPreview || `https://ui-avatars.com/api/?name=${formData.name || 'U'}&background=random`} alt="Profile" className="w-24 h-24 rounded-full object-cover" />
                    <div><label className="block text-sm font-medium text-gray-700">프로필 사진</label><input type="file" accept="image/*" onChange={handlePhotoChange} className="mt-1 w-full"/></div>
                </div>
                <div className="flex items-center gap-4">
                    {signaturePreview && <img src={signaturePreview} alt="Signature" className="w-24 h-24 object-contain border rounded-md" />}
                    <div><label className="block text-sm font-medium text-gray-700">서명 이미지</label><input type="file" accept="image/*" onChange={handleSignatureChange} className="mt-1 w-full"/></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="이메일" required disabled={isEditing} className="w-full p-2 border rounded-md" />
                    {!isEditing && <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="비밀번호 (6자 이상)" required className="w-full p-2 border rounded-md" />}
                    <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="이름" required className="w-full p-2 border rounded-md" />
                    <input type="text" name="contact" value={formData.contact} onChange={handleChange} placeholder="연락처" className="w-full p-2 border rounded-md" />
                    <input type="text" name="organization" value={formData.organization} onChange={handleChange} placeholder="소속 기관" required className="w-full p-2 border rounded-md" />
                    <input type="text" name="position" value={formData.position} onChange={handleChange} placeholder="직급" required className="w-full p-2 border rounded-md" />
                    <select name="qualificationLevel" value={formData.qualificationLevel} onChange={handleChange} className="w-full p-2 border rounded-md">{qualificationLevels.map(level => <option key={level}>{level}</option>)}</select>
                    <input type="date" name="birthdate" value={formData.birthdate} onChange={handleChange} className="w-full p-2 border rounded-md" />
                    <input type="text" name="finalEducation" value={formData.finalEducation} onChange={handleChange} placeholder="최종학력" className="w-full p-2 border rounded-md" />
                    <input type="text" name="major" value={formData.major} onChange={handleChange} placeholder="전공" className="w-full p-2 border rounded-md" />
                    <div>
                        <label className="block text-sm font-medium text-gray-700">검사소 (다중 선택 가능)</label>
                        <select multiple name="inspectionOffice" value={formData.inspectionOffice} onChange={handleMultiSelectChange} className="w-full h-24 p-2 border rounded-md">
                            {inspectionOffices.map(office => <option key={office} value={office}>{office}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">분석기관 (다중 선택 가능)</label>
                        <select multiple name="analysisAgency" value={formData.analysisAgency} onChange={handleMultiSelectChange} className="w-full h-24 p-2 border rounded-md">
                            {analysisAgencies.map(agency => <option key={agency} value={agency}>{agency}</option>)}
                        </select>
                    </div>
                </div>
                <AnalysisExperienceForm analysisExperience={analysisExperience} setAnalysisExperience={setAnalysisExperience} />
                <TrainingHistoryForm trainingHistory={trainingHistory} setTrainingHistory={setTrainingHistory} />
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">취소</button>
                    <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">{isSubmitting ? '저장 중...' : '저장'}</button>
                </div>
            </form>
        </div></div>
    );
}

// --- Generic Management Components ---

function GenericModal({ isOpen, onClose, onSubmit, item, fields, title }) {
    const [formData, setFormData] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const initialData = fields.reduce((acc, field) => {
            acc[field.name] = item?.[field.name] || '';
            return acc;
        }, {});
        setFormData(initialData);
    }, [item, fields, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSubmit(formData);
            onClose();
        } catch (error) {
            console.error("Submit failed:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 sm:p-8 w-full max-w-lg">
                <h3 className="text-xl font-bold mb-6">{title}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {fields.map(field => (
                        <div key={field.name}>
                            <label className="block text-sm font-medium text-gray-700">{field.label}</label>
                            <input type={field.type || 'text'} name={field.name} value={formData[field.name] || ''} onChange={handleChange} placeholder={field.label} required className="mt-1 w-full p-2 border rounded-md" />
                        </div>
                    ))}
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">취소</button>
                        <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">{isSubmitting ? '저장 중...' : '저장'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function GenericManagement({ title, collectionName, itemFields, fieldLabels }) {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [message, setMessage] = useState('');
    const [uploadFile, setUploadFile] = useState(null);
    const [expandedItemId, setExpandedItemId] = useState(null);

    const collectionRef = collection(db, `/artifacts/${appId}/public/data/${collectionName}`);

    useEffect(() => {
        const unsubscribe = onSnapshot(query(collectionRef, orderBy("createdAt", "desc")), (snapshot) => {
            setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLoading(false);
        }, (error) => {
            setMessage(`${title}을(를) 불러오는 데 실패했습니다.`);
            setIsLoading(false);
        });
        return unsubscribe;
    }, [collectionName, title]);

    const handleAddNew = () => { setEditingItem(null); setIsModalOpen(true); };
    const handleEdit = (item) => { setEditingItem(item); setIsModalOpen(true); };
    const handleDelete = async (itemId) => {
        if (!window.confirm("정말로 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(collectionRef, itemId));
            setMessage("항목이 삭제되었습니다.");
        } catch (error) {
            setMessage(`삭제 실패: ${error.message}`);
        }
    };

    const handleModalSubmit = async (formData) => {
        if (editingItem) {
            await updateDoc(doc(collectionRef, editingItem.id), formData);
            setMessage("항목이 성공적으로 수정되었습니다.");
        } else {
            await addDoc(collectionRef, { ...formData, createdAt: Timestamp.now() });
            setMessage("항목이 성공적으로 추가되었습니다.");
        }
    };

    const handleDownloadData = () => {
        const dataToExport = items.map(item => {
            let row = { id: item.id };
            itemFields.forEach((field, index) => { row[fieldLabels[index]] = item[field] || ''; });
            return row;
        });
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, title);
        XLSX.writeFile(workbook, `${collectionName}.xlsx`);
    };

    const handleDownloadTemplate = () => {
        const headers = [['id', ...fieldLabels]];
        const worksheet = XLSX.utils.aoa_to_sheet(headers);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
        XLSX.writeFile(workbook, `${collectionName}_template.xlsx`);
    };

    const handleExcelUpload = () => {
        if (!uploadFile) return;
        const confirmation = window.confirm("엑셀 파일로 정보를 일괄 업로드합니다. ID가 일치하는 항목은 덮어쓰기되고, ID가 없는 항목은 새로 추가됩니다. 계속하시겠습니까?");
        if (!confirmation) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                if (json.length === 0) { setMessage("엑셀 파일에 데이터가 없습니다."); return; }

                setMessage("업로드 및 업데이트 시작...");
                const promises = [];
                const labelToKey = itemFields.reduce((acc, field, index) => ({ ...acc, [fieldLabels[index]]: field }), {});

                json.forEach(row => {
                    const { id, ...rowData } = row;
                    const newDocData = {};
                    for (const label in rowData) {
                        const key = labelToKey[label];
                        if (key) newDocData[key] = row[label];
                    }

                    if (id && items.find(item => item.id === id)) {
                        promises.push(updateDoc(doc(collectionRef, id), newDocData));
                    } else {
                        promises.push(addDoc(collectionRef, { ...newDocData, createdAt: Timestamp.now() }));
                    }
                });

                await Promise.all(promises);
                setMessage(`${promises.length}개 항목이 처리되었습니다.`);
            } catch (error) {
                setMessage(`엑셀 업로드 실패: ${error.message}`);
            }
        };
        reader.readAsArrayBuffer(uploadFile);
    };
    
    const fieldsForModal = itemFields.map((fieldName, index) => ({ name: fieldName, label: fieldLabels[index] }));

    if (isLoading) return <div>{title} 목록을 불러오는 중...</div>;

    return (
        <div>
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h2 className="text-2xl font-bold">{title}</h2>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={handleDownloadTemplate} className="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600">엑셀 템플릿</button>
                    <button onClick={handleDownloadData} className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">엑셀 다운로드</button>
                    <div className="flex items-center gap-2 border p-2 rounded-lg">
                        <input type="file" accept=".xlsx, .xls" onChange={(e) => setUploadFile(e.target.files[0])} className="text-sm"/>
                        <button onClick={handleExcelUpload} disabled={!uploadFile} className="bg-purple-600 text-white font-bold py-1 px-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400">업로드</button>
                    </div>
                    <button onClick={handleAddNew} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">신규 추가</button>
                </div>
            </div>
            {message && <p className="p-3 rounded-lg mb-4 bg-blue-100 text-blue-800">{message}</p>}
            <GenericModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleModalSubmit} item={editingItem} fields={fieldsForModal} title={editingItem ? `${title} 수정` : `신규 ${title} 추가`} />
            <div className="bg-white shadow-md rounded-lg overflow-x-auto"><table className="min-w-full leading-normal">
                <thead><tr>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase"> </th>
                    {fieldLabels.map(label => <th key={label} className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{label}</th>)}
                    <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100"></th>
                </tr></thead>
                <tbody>{items.map(item => (
                    <React.Fragment key={item.id}>
                        <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}>
                            <td className="px-5 py-5 border-b text-sm">{expandedItemId === item.id ? '▼' : '▶'}</td>
                            {itemFields.map(field => <td key={field} className="px-5 py-5 border-b border-gray-200 bg-white text-sm">{item[field]}</td>)}
                            <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-right">
                                <button onClick={(e) => { e.stopPropagation(); handleEdit(item);}} className="text-indigo-600 hover:text-indigo-900 mr-4">수정</button>
                                <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id);}} className="text-red-600 hover:text-red-900">삭제</button>
                            </td>
                        </tr>
                        {expandedItemId === item.id && (
                            <tr>
                                <td colSpan={itemFields.length + 2} className="p-5 bg-gray-100">
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                                        {itemFields.map((field, index) => (
                                            <div key={field}><strong>{fieldLabels[index]}:</strong> {item[field] || 'N/A'}</div>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </React.Fragment>
                ))}</tbody>
            </table></div>
        </div>
    );
}

function InspectionOfficeManagement() {
    const fields = ['name', 'address', 'contact', 'coordinates', 'managerName', 'managerContact'];
    const labels = ['검사소명', '주소', '대표연락처', '좌표', '담당자', '담당자 연락처'];
    return <GenericManagement title="검사소 관리" collectionName="inspection_offices" itemFields={fields} fieldLabels={labels} />;
}

function AnalysisAgencyManagement() {
    const fields = ['name', 'address', 'contact', 'coordinates', 'managerName', 'managerContact'];
    const labels = ['분석기관명', '주소', '대표연락처', '좌표', '담당자', '담당자 연락처'];
    return <GenericManagement title="분석기관 관리" collectionName="analysis_agencies" itemFields={fields} fieldLabels={labels} />;
}

function EquipmentManagement() {
    const [view, setView] = useState('list'); // 'list' or 'form'
    const [selectedItem, setSelectedItem] = useState(null);
    const [equipment, setEquipment] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [uploadFile, setUploadFile] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const collectionRef = collection(db, `/artifacts/${appId}/public/data/equipment`);

    const equipmentFields = [
        {label: '장비명', key: 'name'}, {label: '모델명', key: 'model'}, {label: '검출기 S/N', key: 'detectorSn'},
        {label: '제조회사', key: 'manufacturer'}, {label: '취득일자', key: 'acquisitionDate'}, {label: '상대효율', key: 'relativeEfficiency'},
        {label: '시료자동교환장치', key: 'autoSampler'}, {label: '분석기관명', key: 'agency'}, {label: '관리자', key: 'manager'}, {label: '등록구분', key: 'registrationType'}
    ];

    useEffect(() => {
        const unsubscribe = onSnapshot(query(collectionRef, orderBy("name")), (snapshot) => {
            setEquipment(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLoading(false);
        });
        return unsubscribe;
    }, []);

    const handleSave = async (data) => {
        try {
            if (selectedItem) {
                await updateDoc(doc(collectionRef, selectedItem.id), data);
                setMessage("장비 정보가 수정되었습니다.");
            } else {
                await addDoc(collectionRef, { ...data, createdAt: Timestamp.now() });
                setMessage("장비가 추가되었습니다.");
            }
            setView('list');
        } catch (error) {
            setMessage(`저장 실패: ${error.message}`);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("정말로 이 장비를 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(collectionRef, id));
            setMessage("장비가 삭제되었습니다.");
        } catch (error) {
            setMessage(`삭제 실패: ${error.message}`);
        }
    };

    const handleDownloadData = () => {
        const dataToExport = equipment.map(item => {
            let row = { id: item.id };
            equipmentFields.forEach(field => { row[field.label] = item[field.key] || ''; });
            return row;
        });
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Equipment");
        XLSX.writeFile(workbook, "장비_목록.xlsx");
    };

    const handleDownloadTemplate = () => {
        const headers = [['id', ...equipmentFields.map(f => f.label)]];
        const worksheet = XLSX.utils.aoa_to_sheet(headers);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
        XLSX.writeFile(workbook, "장비_업로드_템플릿.xlsx");
    };

    const handleExcelUpload = () => {
        if (!uploadFile) return;
        const confirmation = window.confirm("엑셀 파일로 장비 정보를 일괄 업로드합니다. ID가 일치하는 항목은 덮어쓰기되고, ID가 없는 항목은 새로 추가됩니다. 사진과 교정이력은 업로드되지 않습니다. 계속하시겠습니까?");
        if (!confirmation) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                if (json.length === 0) { setMessage("엑셀 파일에 데이터가 없습니다."); return; }

                setMessage("업로드 및 업데이트 시작...");
                const promises = [];
                const labelToKey = equipmentFields.reduce((acc, field) => ({ ...acc, [field.label]: field.key }), {});

                json.forEach(row => {
                    const { id, ...rowData } = row;
                    const newDocData = {};
                    for (const label in rowData) {
                        const key = labelToKey[label];
                        if (key) newDocData[key] = row[label];
                    }

                    if (id && equipment.find(item => item.id === id)) {
                        promises.push(updateDoc(doc(collectionRef, id), newDocData));
                    } else {
                        promises.push(addDoc(collectionRef, { ...newDocData, createdAt: Timestamp.now() }));
                    }
                });

                await Promise.all(promises);
                setMessage(`${promises.length}개 항목이 처리되었습니다.`);
            } catch (error) {
                setMessage(`엑셀 업로드 실패: ${error.message}`);
            }
        };
        reader.readAsArrayBuffer(uploadFile);
    };

    if (isLoading) return <div>장비 목록을 불러오는 중...</div>;

    if (view === 'form') {
        return (
            <div>
                <h2 className="text-2xl font-bold mb-6">{selectedItem ? '장비 이력 수정' : '신규 장비 추가'}</h2>
                <EquipmentForm item={selectedItem} onSave={handleSave} onCancel={() => setView('list')} />
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h2 className="text-2xl font-bold">장비 이력 관리</h2>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={handleDownloadTemplate} className="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600">엑셀 템플릿</button>
                    <button onClick={handleDownloadData} className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">엑셀 다운로드</button>
                    <div className="flex items-center gap-2 border p-2 rounded-lg">
                        <input type="file" accept=".xlsx, .xls" onChange={(e) => setUploadFile(e.target.files[0])} className="text-sm"/>
                        <button onClick={handleExcelUpload} disabled={!uploadFile} className="bg-purple-600 text-white font-bold py-1 px-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400">업로드</button>
                    </div>
                    <button onClick={() => { setSelectedItem(null); setView('form'); }} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">신규 장비 추가</button>
                </div>
            </div>
            {message && <p className="p-3 rounded-lg mb-4 bg-blue-100 text-blue-800">{message}</p>}
            <div className="bg-white shadow-md rounded-lg overflow-x-auto"><table className="min-w-full leading-normal">
                <thead><tr>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase"> </th>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase">장비명</th>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase">모델명</th>
                    <th className="px-5 py-3 border-b-2 text-left text-xs font-semibold uppercase">분석기관</th>
                    <th className="px-5 py-3 border-b-2"></th>
                </tr></thead>
                <tbody>{equipment.map(item => (
                    <React.Fragment key={item.id}>
                        <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                            <td className="px-5 py-5 border-b text-sm">{expandedId === item.id ? '▼' : '▶'}</td>
                            <td className="px-5 py-5 border-b text-sm">{item.name}</td>
                            <td className="px-5 py-5 border-b text-sm">{item.model}</td>
                            <td className="px-5 py-5 border-b text-sm">{item.agency}</td>
                            <td className="px-5 py-5 border-b text-sm text-right">
                                <button onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setView('form'); }} className="text-indigo-600 hover:text-indigo-900 mr-4">수정</button>
                                <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id);}} className="text-red-600 hover:text-red-900">삭제</button>
                            </td>
                        </tr>
                        {expandedId === item.id && (
                            <tr>
                                <td colSpan="5" className="p-5 bg-gray-100">
                                    <div className="grid grid-cols-2 gap-4">
                                        {equipmentFields.map(field => <div key={field.key}><strong>{field.label}:</strong> {item[field.key] || 'N/A'}</div>)}
                                    </div>
                                    <div className="mt-4 grid grid-cols-3 gap-4">
                                        {item.photoUrls?.cert && <img src={item.photoUrls.cert} alt="필증" className="w-full h-32 object-cover"/>}
                                        {item.photoUrls?.full && <img src={item.photoUrls.full} alt="전체" className="w-full h-32 object-cover"/>}
                                        {item.photoUrls?.warranty && <img src={item.photoUrls.warranty} alt="보증서" className="w-full h-32 object-cover"/>}
                                    </div>
                                    {item.calibrationHistory && item.calibrationHistory.length > 0 && (
                                        <div className="mt-4"><strong>교정 이력:</strong><ul>{item.calibrationHistory.map(h => <li key={h.id}>{h.date}: {h.content}</li>)}</ul></div>
                                    )}
                                </td>
                            </tr>
                        )}
                    </React.Fragment>
                ))}
                </tbody>
            </table>
        </div>
    </div>
    );
}

function CalibrationHistory({ history, setHistory }) {
    const [date, setDate] = useState('');
    const [content, setContent] = useState('');

    const handleAdd = () => {
        if (!date || !content) return;
        const newItem = { date, content, id: Date.now() };
        setHistory(prev => [...prev, newItem]);
        setDate('');
        setContent('');
    };

    const handleDelete = (id) => {
        setHistory(prev => prev.filter(item => item.id !== id));
    };

    return (
        <div className="p-4 border rounded-lg mt-4">
            <h4 className="font-semibold">교정 이력</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 my-2">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded-md" />
                <input type="text" value={content} onChange={e => setContent(e.target.value)} placeholder="교정 내용" className="w-full p-2 border rounded-md" />
                <button type="button" onClick={handleAdd} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">추가</button>
            </div>
            <ul className="divide-y divide-gray-200 mt-2">
                {history.map(item => (
                    <li key={item.id} className="flex justify-between items-center py-2">
                        <span>{item.date}: {item.content}</span>
                        <button type="button" onClick={() => handleDelete(item.id)} className="text-red-500">삭제</button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function EquipmentForm({ item, onSave, onCancel }) {
    const [formData, setFormData] = useState({ name: '', acquisitionDate: '', model: '', relativeEfficiency: '', autoSampler: '', agency: '', manager: '', detectorSn: '', manufacturer: '', registrationType: '' });
    const [calibrationHistory, setCalibrationHistory] = useState([]);
    const [photos, setPhotos] = useState({ cert: null, full: null, warranty: null });
    const [previews, setPreviews] = useState({ cert: null, full: null, warranty: null });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (item) {
            setFormData({ name: item.name || '', acquisitionDate: item.acquisitionDate || '', model: item.model || '', relativeEfficiency: item.relativeEfficiency || '', autoSampler: item.autoSampler || '', agency: item.agency || '', manager: item.manager || '', detectorSn: item.detectorSn || '', manufacturer: item.manufacturer || '', registrationType: item.registrationType || '' });
            setCalibrationHistory(item.calibrationHistory || []);
            setPreviews({ cert: item.photoUrls?.cert || null, full: item.photoUrls?.full || null, warranty: item.photoUrls?.warranty || null });
        } else {
            setFormData({ name: '', acquisitionDate: '', model: '', relativeEfficiency: '', autoSampler: '', agency: '', manager: '', detectorSn: '', manufacturer: '', registrationType: '' });
            setCalibrationHistory([]);
            setPreviews({ cert: null, full: null, warranty: null });
        }
    }, [item]);

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handlePhotoChange = (e) => {
        const { name, files } = e.target;
        if (files[0]) {
            setPhotos(prev => ({ ...prev, [name]: files[0] }));
            setPreviews(prev => ({ ...prev, [name]: URL.createObjectURL(files[0]) }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const photoUrls = { ...item?.photoUrls };
            for (const key in photos) {
                if (photos[key]) {
                    const storageRef = ref(storage, `equipment/${item?.id || Date.now()}/${key}`);
                    await uploadBytes(storageRef, photos[key]);
                    photoUrls[key] = await getDownloadURL(storageRef);
                }
            }
            await onSave({ ...formData, calibrationHistory, photoUrls });
        } catch (error) {
            console.error("Equipment save failed:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto p-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input name="name" value={formData.name} onChange={handleChange} placeholder="장비명" required className="p-2 border rounded-md" />
                <input name="model" value={formData.model} onChange={handleChange} placeholder="모델명" className="p-2 border rounded-md" />
                <input name="detectorSn" value={formData.detectorSn} onChange={handleChange} placeholder="검출기 S/N" className="p-2 border rounded-md" />
                <input name="manufacturer" value={formData.manufacturer} onChange={handleChange} placeholder="제조회사" className="p-2 border rounded-md" />
                <input type="date" name="acquisitionDate" value={formData.acquisitionDate} onChange={handleChange} placeholder="취득일자" className="p-2 border rounded-md" />
                <input name="relativeEfficiency" value={formData.relativeEfficiency} onChange={handleChange} placeholder="상대효율" className="p-2 border rounded-md" />
                <input name="autoSampler" value={formData.autoSampler} onChange={handleChange} placeholder="시료자동교환장치" className="p-2 border rounded-md" />
                <input name="agency" value={formData.agency} onChange={handleChange} placeholder="분석기관명" className="p-2 border rounded-md" />
                <input name="manager" value={formData.manager} onChange={handleChange} placeholder="관리자" className="p-2 border rounded-md" />
                <input name="registrationType" value={formData.registrationType} onChange={handleChange} placeholder="등록구분" className="p-2 border rounded-md" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[ {key: 'cert', label: '필증부착사진'}, {key: 'full', label: '장비전체사진'}, {key: 'warranty', label: '장비보증서류'} ].map(p => (
                    <div key={p.key} className="text-center">
                        <label className="text-sm font-medium">{p.label}</label>
                        {previews[p.key] && <img src={previews[p.key]} alt={p.label} className="w-full h-32 object-cover rounded-md my-2"/>}
                        <input type="file" name={p.key} accept="image/*" onChange={handlePhotoChange} className="w-full" />
                    </div>
                ))}
            </div>
            <CalibrationHistory history={calibrationHistory} setHistory={setCalibrationHistory} />
            <div className="flex justify-end gap-4 pt-4">
                <button type="button" onClick={onCancel} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg">취소</button>
                <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">{isSubmitting ? '저장 중...' : '저장'}</button>
            </div>
        </form>
    );
}