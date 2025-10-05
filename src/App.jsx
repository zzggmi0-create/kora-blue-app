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
    Timestamp
} from 'firebase/firestore';
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from 'firebase/storage';
import logo from './assets/logo.png';

// --- Firebase 설정 ---
// VS Code로 이전 시, 이 정보를 .env 파일로 옮겨 보안을 강화하는 것을 권장합니다.
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
    console.log(`[진단] Firebase가 프로젝트 ID '${firebaseConfig.projectId}'로 성공적으로 초기화되었습니다.`);
} catch (error) {
    console.error("[진단][오류] Firebase 초기화 실패:", error);
}

// --- 앱 아이디 설정 ---
const appId = 'default-kora-blue-app';


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
                        setLoginError(`로그인 성공, 그러나 Firestore에서 사용자 정보를 찾을 수 없습니다. (UID: ${user.uid}). 관리자에게 문의하여 데이터베이스 설정을 확인하세요.`);
                        await signOut(auth);
                    }
                } catch (error) {
                    setLoginError(`데이터베이스 조회 중 오류 발생: ${error.message}`);
                    await signOut(auth);
                }
            } else {
                setUser(null);
                setUserData(null);
            }
            setLoading(false);
        });
        
        return () => unsubscribe();
    }, [isDemoMode]);

    const handleDemoLogin = (role) => {
        const demoUser = { uid: `demo-${role.toLowerCase()}`, isAnonymous: false };
        const demoUserData = {
            name: `${role} (데모)`,
            email: `${role.toLowerCase()}@demo.com`,
            organization: '데모기관',
            position: '데모직급',
            qualificationLevel: role,
            uid: `demo-${role.toLowerCase()}`
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
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-gray-100"><div className="text-xl font-bold">로딩 중...</div></div>;
    }

    if (!user || !userData) {
        return <LoginScreen initialError={loginError} onDemoLogin={handleDemoLogin} />;
    }

    if (!appMode) {
        return <ModeSelectionScreen setAppMode={setAppMode} userData={userData} onLogout={handleLogout} />;
    }

    if (appMode === 'control') {
        return <ControlSystemApp userData={userData} setAppMode={setAppMode} onLogout={handleLogout} />;
    }

    if (appMode === 'analysis') {
        return <AnalysisSystemApp userData={userData} setAppMode={setAppMode} onLogout={handleLogout} />;
    }
}


// --- 화면 컴포넌트들 ---

function LoginScreen({ initialError, onDemoLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(initialError || '');
    const [message, setMessage] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [demoRole, setDemoRole] = useState('관리자');

    useEffect(() => {
        if (initialError) {
            setError(initialError);
            setIsLoggingIn(false); 
        }
    }, [initialError]);

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
        if (!email) {
            setError("비밀번호를 재설정할 이메일 주소를 입력해주세요.");
            return;
        }
        setError('');
        setMessage('');
        try {
            await sendPasswordResetEmail(auth, email);
            setMessage("비밀번호 재설정 이메일을 발송했습니다. 이메일을 확인해주세요.");
        } catch (error) {
            setError("비밀번호 재설정 이메일 발송에 실패했습니다.");
        }
    };

    const handleDemoButtonClick = () => {
        onDemoLogin(demoRole);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
                <div className="text-center">
                    <img src={logo} alt="logo" className="mx-auto h-16 w-auto mb-4" />
                    <h1 className="text-3xl font-bold text-gray-800">RadAn-Net</h1>
                    <p className="text-gray-500">수산물 방사능 분석 관제 시스템</p>
                    <div className="mt-2 text-sm text-gray-400">By KoRA</div>
                </div>
                {error && <p className="text-red-500 text-sm text-center bg-red-100 p-3 rounded-lg">{error}</p>}
                {message && <p className="text-green-500 text-sm text-center bg-green-100 p-3 rounded-lg">{message}</p>}
                
                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일 주소" required className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                    </div>
                    <div>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" required className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                    </div>
                    <button type="submit" disabled={isLoggingIn} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-transform transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {isLoggingIn ? '로그인 중...' : '로그인'}
                    </button>
                </form>
                 <div className="text-center">
                    <button onClick={handlePasswordReset} className="text-sm text-blue-600 hover:underline">
                        비밀번호를 잊으셨나요?
                    </button>
                </div>

                {/* --- 데모 모드 섹션 --- */}
                <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t"></span></div>
                    <div className="relative flex justify-center text-sm"><span className="bg-white px-2 text-gray-500">또는</span></div>
                </div>
                <div className="space-y-3">
                    <p className="text-center text-sm text-gray-600">데모 모드로 접속하기</p>
                    <select value={demoRole} onChange={(e) => setDemoRole(e.target.value)} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 transition">
                        <option>관리자</option>
                        <option>시료채취원</option>
                        <option>분석원</option>
                        <option>분석보조원</option>
                        <option>기술책임자</option>
                        <option>해수부</option>
                        <option>협회</option>
                    </select>
                    <button onClick={handleDemoButtonClick} className="w-full bg-teal-500 text-white font-bold py-3 rounded-lg hover:bg-teal-600 transition">
                        {demoRole} (으)로 데모 접속
                    </button>
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
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">안녕하세요, {userData.name}님!</h1>
                <p className="mb-6 text-gray-600">접속할 모드를 선택해주세요.</p>
                <div className="flex flex-col sm:flex-row gap-4">
                    {canAccessControlMode && (
                         <button onClick={() => setAppMode('control')} className="flex-1 bg-indigo-600 text-white font-bold py-4 px-6 rounded-lg hover:bg-indigo-700 transition">
                            <h2 className="text-xl">관제 모드</h2><p className="text-sm">(RadAn-Net)</p>
                        </button>
                    )}
                    <button onClick={() => setAppMode('analysis')} className="flex-1 bg-teal-500 text-white font-bold py-4 px-6 rounded-lg hover:bg-teal-600 transition">
                        <h2 className="text-xl">분석 모드</h2><p className="text-sm">(RadAn-Flow)</p>
                    </button>
                </div>
                 <button onClick={onLogout} className="mt-8 text-gray-500 hover:text-gray-700 transition">
                    로그아웃
                </button>
            </div>
        </div>
    );
}

// --- 모바일 사이드바 래퍼 ---
function AppShell({ children, pageTitle, userData, setAppMode, onLogout, onNavClick, currentPage }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    const navItems = {
        analysis: ['HOME', '분석관리', '근무기록', '점검관리', '이력관리'],
        control: ['대시보드', ...(userData.qualificationLevel === '관리자' ? ['관리자 설정'] : [])]
    };

    const pageIdMap = {
        'HOME': 'home', '분석관리': 'analysis', '근무기록': 'work',
        '점검관리': 'inspection', '이력관리': 'history', '대시보드': 'dashboard',
        '관리자 설정': 'settings'
    };

    const appType = pageTitle === 'RadAn-Flow' ? 'analysis' : 'control';

    return (
        <div className="flex h-screen bg-gray-50">
            {/* Backdrop for mobile */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                ></div>
            )}

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 bg-white shadow-md p-4 flex flex-col transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:relative md:w-64 z-30 transition-transform duration-300 ease-in-out`}>
                <div className="text-center py-4 border-b">
                     <h1 className="text-xl font-bold text-gray-800">{pageTitle}</h1>
                </div>
                <nav className="mt-6 flex-1">
                    <ul>
                        {navItems[appType].map(item => {
                            const pageId = pageIdMap[item];
                            return (
                                <li key={item} className="mb-2">
                                    <a href="#" onClick={(e) => { e.preventDefault(); onNavClick(pageId); setIsSidebarOpen(false); }} className={`block py-2 px-4 rounded-lg transition ${currentPage === pageId ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                                        {item}
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
                 <div className="mt-auto">
                    <button onClick={() => setAppMode(null)} className="w-full text-left py-2 px-4 rounded-lg text-gray-600 hover:bg-gray-100 transition"> 모드 선택으로 </button>
                    <button onClick={onLogout} className="w-full text-left py-2 px-4 rounded-lg text-red-500 hover:bg-red-50 transition mt-2"> 로그아웃 </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                <header className="md:hidden bg-white shadow-sm p-4 flex items-center">
                    <button onClick={() => setIsSidebarOpen(true)} className="text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
                    </button>
                    <h2 className="text-lg font-bold ml-4">{pageTitle}</h2>
                </header>
                <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}


function AnalysisSystemApp({ userData, setAppMode, onLogout }) {
    const [page, setPage] = useState('home');
    const [location, setLocation] = useState(null);

    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
            },
            (error) => {
                console.warn("GPS 조회 실패:", error.message);
                setLocation(null);
            }
        );
    }, []);

    const renderPage = () => {
        switch (page) {
            case 'home': return <AnalysisHome userData={userData} location={location} />;
            case 'analysis': return <AnalysisManagement userData={userData} location={location} />;
            default: return <AnalysisHome userData={userData} location={location} />;
        }
    };
    
    return (
        <AppShell 
            pageTitle="RadAn-Flow"
            userData={userData}
            setAppMode={setAppMode}
            onLogout={onLogout}
            onNavClick={setPage}
            currentPage={page}
        >
            {renderPage()}
        </AppShell>
    );
}

function ControlSystemApp({ userData, setAppMode, onLogout }) {
    const [page, setPage] = useState('dashboard');

    const renderPage = () => {
        switch(page) {
            case 'dashboard': return <ControlDashboard />;
            case 'settings': return <UserManagement />;
            default: return <ControlDashboard />;
        }
    };
    
    return (
        <AppShell
            pageTitle="RadAn-Net"
            userData={userData}
            setAppMode={setAppMode}
            onLogout={onLogout}
            onNavClick={setPage}
            currentPage={page}
        >
            {renderPage()}
        </AppShell>
    );
}


function AnalysisHome({ userData, location }) {
    const [message, setMessage] = useState('');
    
    const handleWork = async (type) => {
        setMessage('');
        try {
            const workLogRef = collection(db, `/artifacts/${appId}/public/data/worklogs`);
            await addDoc(workLogRef, {
                userId: userData.uid,
                userName: userData.name,
                type: type, 
                timestamp: Timestamp.now(),
                location: location 
            });
            setMessage(`${type} 기록이 완료되었습니다. ${!location ? '(위치 정보 없음)' : ''}`);
        } catch(error) {
            setMessage("근무기록 저장에 실패했습니다.");
        }
    }

    return (
        <div>
            {message && <p className={`p-3 rounded-lg mb-4 ${message.includes('실패') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{message}</p>}
            <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                 <h2 className="text-2xl font-bold">{userData.name}님, 안녕하세요.</h2>
                 <p className="text-gray-600">{userData.organization} / {userData.position} / {userData.qualificationLevel}</p>
                 <div className="mt-4 flex flex-col sm:flex-row gap-4">
                     <button onClick={() => handleWork('출근')} className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600">출근 기록</button>
                     <button onClick={() => handleWork('퇴근')} className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600">퇴근 기록</button>
                 </div>
                 {location ? 
                    <p className="text-sm text-gray-500 mt-2">현재 GPS: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</p> :
                    <p className="text-sm text-yellow-600 mt-2">경고: GPS 위치 정보를 가져올 수 없습니다.</p>
                }
            </div>
            
             <div className="grid md:grid-cols-2 gap-6">
                 <div className="bg-white p-6 rounded-lg shadow-md"><h3 className="text-lg font-semibold border-b pb-2 mb-4">협회 공지사항</h3><p>등록된 공지사항이 없습니다.</p></div>
                 <div className="bg-white p-6 rounded-lg shadow-md"><h3 className="text-lg font-semibold border-b pb-2 mb-4">나의 분석 이력</h3><p>진행한 분석 내역이 없습니다.</p></div>
                 <div className="bg-white p-6 rounded-lg shadow-md"><h3 className="text-lg font-semibold border-b pb-2 mb-4">나의 출근 기록</h3><p>최근 출근 기록이 없습니다.</p></div>
             </div>
        </div>
    );
}

function AnalysisManagement({ userData, location }) {
    const [samplesByStatus, setSamplesByStatus] = useState({});
    const [currentStep, setCurrentStep] = useState(null); 
    const [selectedSample, setSelectedSample] = useState(null);
    const [message, setMessage] = useState('');

    const processSteps = [
        { id: 'receipt', name: '시료접수', component: SampleRegistrationForm, roles: ['시료채취원', '관리자'] },
        { id: 'receive_wait', name: '시료수령 대기', component: SampleReceiveScreen, roles: ['분석원', '분석보조원', '관리자'] },
        { id: 'prep_wait', name: '시료전처리 대기', component: null, roles: ['분석원', '분석보조원', '관리자'] },
        { id: 'analysis_wait', name: '분석대기', component: null, roles: ['분석원', '관리자'] },
        { id: 'analyzing', name: '분석중', component: null, roles: ['분석원', '관리자'] },
        { id: 'analysis_done', name: '분석완료', component: null, roles: ['분석원', '관리자'] },
        { id: 'tech_review_wait', name: '기술책임자 검토', component: null, roles: ['기술책임자', '관리자'] },
        { id: 'assoc_review_wait', name: '협회 검토', component: null, roles: ['협회', '관리자'] },
        { id: 'complete', name: '최종완료', component: null, roles: ['all'] },
    ];

    useEffect(() => {
        const samplesRef = collection(db, `/artifacts/${appId}/public/data/samples`);
        const q = userData.qualificationLevel === '관리자' 
            ? samplesRef 
            : query(samplesRef, where("lab", "==", userData.organization));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const statusCounts = processSteps.reduce((acc, step) => ({ ...acc, [step.id]: [] }), {});
            querySnapshot.forEach((doc) => {
                const sample = { id: doc.id, ...doc.data() };
                if (statusCounts[sample.status]) {
                    statusCounts[sample.status].push(sample);
                }
            });
            setSamplesByStatus(statusCounts);
        }, (error) => {
            setMessage("샘플 데이터를 불러오는 데 실패했습니다. Firestore 규칙을 확인해주세요.");
        });

        return () => unsubscribe();
    }, [userData.organization, userData.qualificationLevel]);
    
    const handleStepClick = (stepId) => {
        setMessage('');
        const stepInfo = processSteps.find(s => s.id === stepId);
        if (!stepInfo) return;

        const canAccess = stepInfo.roles.includes(userData.qualificationLevel) || stepInfo.roles.includes('all');

        if(canAccess){
            setCurrentStep(stepId);
            setSelectedSample(null);
        } else {
             setMessage(`이 단계에 접근할 권한이 없습니다.`);
        }
    };
    
    const renderStepContent = () => {
        if (!currentStep) return <p className="text-center text-gray-500 mt-10">상단 플로우에서 단계를 선택하여 작업을 시작하세요.</p>;
        
        const stepInfo = processSteps.find(s => s.id === currentStep);
        if (!stepInfo) return null;
        
        const samplesForStep = samplesByStatus[currentStep] || [];

        if(selectedSample) {
            const DetailComponent = stepInfo.component;
            return DetailComponent ? <DetailComponent sample={selectedSample} userData={userData} location={location} setSelectedSample={setSelectedSample} showMessage={setMessage} /> : <p className="text-center mt-10">{stepInfo.name} 상세 화면은 현재 개발 중입니다.</p>;
        }
        
        if (currentStep === 'receipt') {
            return <SampleRegistrationForm userData={userData} location={location} setCurrentStep={setCurrentStep} showMessage={setMessage} />;
        }
        
        return (
            <div>
                <h3 className="text-xl font-bold mb-4">{stepInfo.name} ({samplesForStep.length}건)</h3>
                <div className="bg-white rounded-lg shadow">
                    <ul className="divide-y divide-gray-200">
                        {samplesForStep.length > 0 ? samplesForStep.map(sample => (
                             <li key={sample.id} onClick={() => stepInfo.component && setSelectedSample(sample)} className={`p-4 ${stepInfo.component ? 'hover:bg-gray-50 cursor-pointer' : ''}`}>
                                 <p className="font-semibold">{sample.sampleCode}</p>
                                 <p className="text-sm text-gray-600">{sample.itemName} / {sample.location}</p>
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
            {message && <p className="p-3 bg-red-100 text-red-800 rounded-lg mb-4">{message}</p>}
            <div className="overflow-x-auto pb-4 mb-6">
                <div className="flex items-center space-x-2 whitespace-nowrap p-2">
                    {processSteps.map((step, index) => {
                         const count = samplesByStatus[step.id] ? samplesByStatus[step.id].length : 0;
                         const canAccess = step.roles.includes(userData.qualificationLevel) || step.roles.includes('all');
                         return (
                            <React.Fragment key={step.id}>
                                <button
                                    onClick={() => handleStepClick(step.id)}
                                    className={`flex flex-col items-center justify-center p-3 rounded-lg w-32 h-24 text-center transition ${ currentStep === step.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-white shadow' } ${canAccess ? 'cursor-pointer hover:bg-blue-50' : 'cursor-not-allowed bg-gray-200 text-gray-500'}`}
                                    disabled={!canAccess}
                                >
                                    <span className="font-semibold text-sm">{step.name}</span>
                                    <span className="text-2xl font-bold">{count}</span>
                                </button>
                                {index < processSteps.length - 1 && <div className="text-gray-300 text-2xl font-light mx-1">→</div>}
                             </React.Fragment>
                         );
                    })}
                </div>
            </div>
            
            <div className="mt-6">
                {renderStepContent()}
            </div>
        </div>
    );
}

function SampleRegistrationForm({ userData, location, setCurrentStep, showMessage }) {
    const [formData, setFormData] = useState({ type: '위판장', location: '', datetime: '', itemName: '', weight: '', etc: '', collectorName: userData.name, collectorContact: '', receivingLab: '수품원 인천지원', });
    const [photos, setPhotos] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleInputChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
    const handleFileChange = (e) => { if (e.target.files.length > 2) { showMessage("사진은 최대 2장까지 업로드 가능합니다."); return; } setPhotos(Array.from(e.target.files)); };
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const now = new Date();
            const sampleCode = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

            const photoURLs = await Promise.all( photos.map(async (photo) => { const storageRef = ref(storage, `samples/${sampleCode}/${photo.name}`); await uploadBytes(storageRef, photo); return await getDownloadURL(storageRef); }) );

            const sampleDoc = { ...formData, sampleCode, status: 'receive_wait', lab: formData.receivingLab, photos: photoURLs, history: [{ action: '시료접수', user: userData.name, userId: userData.uid, timestamp: Timestamp.now(), location: location }] };

            await addDoc(collection(db, `/artifacts/${appId}/public/data/samples`), sampleDoc);
            showMessage("시료 접수가 완료되었습니다.");
            setCurrentStep('receive_wait');
        } catch (error) {
            showMessage("시료 접수에 실패했습니다.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4">시료 접수</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                     <div><label className="block text-sm font-medium text-gray-700">시료구분</label><select name="type" value={formData.type} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"><option>위판장</option> <option>양식장</option> <option>천일염</option> <option>기타</option></select></div>
                     <div><label className="block text-sm font-medium text-gray-700">인수예정기관</label><select name="receivingLab" value={formData.receivingLab} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"><option>수품원 인천지원</option> <option>알엠택</option></select></div>
                     <input type="text" name="location" placeholder="채취장소" onChange={handleInputChange} required className="p-2 border rounded-md" />
                     <input type="datetime-local" name="datetime" onChange={handleInputChange} required className="p-2 border rounded-md" />
                     <input type="text" name="itemName" placeholder="품목명" onChange={handleInputChange} required className="p-2 border rounded-md" />
                     <input type="number" name="weight" placeholder="중량(kg)" onChange={handleInputChange} required className="p-2 border rounded-md" />
                </div>
                 <div><label className="block text-sm font-medium text-gray-700">시료 사진 (최대 2장)</label><input type="file" multiple accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" /></div>
                
                {location ?
                    <p className="text-sm text-gray-500">현재 GPS: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}</p> :
                    <p className="text-sm text-yellow-600">경고: GPS 위치를 기록할 수 없습니다. (진행 가능)</p>
                }
                <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400">
                    {isSubmitting ? '접수 중...' : '접수 완료'}
                </button>
            </form>
        </div>
    );
}

function SampleReceiveScreen({ sample, userData, location, setSelectedSample, showMessage }) {
    const [photos, setPhotos] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleFileChange = (e) => { if (e.target.files.length > 2) { showMessage("사진은 최대 2장까지 업로드 가능합니다."); return; } setPhotos(Array.from(e.target.files)); };

    const handleReceive = async () => {
         if (photos.length === 0) { showMessage("시료 수령 사진을 업로드해주세요."); return; }
        setIsSubmitting(true);
        try {
            const photoURLs = await Promise.all( photos.map(async (photo) => { const storageRef = ref(storage, `samples/${sample.sampleCode}/receive_${photo.name}`); await uploadBytes(storageRef, photo); return await getDownloadURL(storageRef); }) );
            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);
            const newHistoryEntry = { action: '시료수령', user: userData.name, userId: userData.uid, timestamp: Timestamp.now(), location: location, photos: photoURLs };
            await updateDoc(sampleRef, { status: 'prep_wait', history: [...sample.history, newHistoryEntry] });
            showMessage('시료 수령이 완료되었습니다.');
            setSelectedSample(null);
        } catch (error) {
            showMessage("시료 수령 처리에 실패했습니다.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <button onClick={() => setSelectedSample(null)} className="mb-4 text-blue-600 hover:underline">← 목록으로</button>
            <h3 className="text-xl font-bold mb-4">시료 수령: {sample.sampleCode}</h3>
            <div className="space-y-2 mb-4 text-sm text-gray-700">
                <p><strong>품목명:</strong> {sample.itemName}</p>
                <p><strong>채취장소:</strong> {sample.location}</p>
                <p><strong>채취자:</strong> {sample.collectorName}</p>
            </div>
            <div><label className="block text-sm font-medium text-gray-700">시료 수령 사진 (최대 2장)</label><input type="file" multiple accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" /></div>
            
            {location ?
                <p className="text-sm text-gray-500 mt-2">현재 GPS: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}</p> :
                <p className="text-sm text-yellow-600 mt-2">경고: GPS 위치를 기록할 수 없습니다. (진행 가능)</p>
            }
            <button onClick={handleReceive} disabled={isSubmitting} className="mt-6 w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 transition disabled:bg-gray-400">
                {isSubmitting ? '처리 중...' : '시료 인수 완료'}
            </button>
        </div>
    );
}

function ControlDashboard() { return ( <div> <h2 className="text-2xl font-bold">진행 현황 대시보드</h2> <p className="mt-4">대시보드 기능은 현재 개발 중입니다.</p> </div> ); }

function UserManagement() {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const usersRef = collection(db, `/artifacts/${appId}/public/data/users`);
        const unsubscribe = onSnapshot(usersRef, (snapshot) => {
            const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUsers(userList);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleEdit = (user) => { setMessage(''); setEditingUser(user); setIsModalOpen(true); };
    const handleAddNew = () => { setMessage(''); setEditingUser(null); setIsModalOpen(true); };
    const handleCloseModal = (successMessage = '') => { setIsModalOpen(false); setEditingUser(null); if (successMessage) { setMessage(successMessage); } };
    
    const handlePasswordReset = async (email) => {
        setMessage('');
        try {
            await sendPasswordResetEmail(auth, email);
            setMessage(`비밀번호 재설정 이메일을 ${email}로 성공적으로 발송했습니다.`);
        } catch (error) {
            setMessage(`이메일 발송에 실패했습니다: ${error.message}`);
        }
    };

    if (isLoading) { return <div>사용자 목록을 불러오는 중...</div>; }

    return (
        <div>
            <div className="flex justify-between items-center mb-6"> <h2 className="text-2xl font-bold">회원 관리</h2> <button onClick={handleAddNew} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition"> 신규 회원 추가 </button> </div>
            {message && <p className={`p-3 rounded-lg mb-4 ${message.includes('실패') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{message}</p>}
            {isModalOpen && <UserModal user={editingUser} onClose={handleCloseModal} />}
            
            {/* Desktop Table */}
            <div className="hidden md:block bg-white shadow-md rounded-lg overflow-hidden">
                <table className="min-w-full leading-normal">
                    <thead><tr><th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">이름</th><th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">이메일</th><th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">소속</th><th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">자격 등급</th><th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100"></th></tr></thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id}>
                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">{user.name}</td><td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">{user.email}</td><td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">{user.organization}</td><td className="px-5 py-5 border-b border-gray-200 bg-white text-sm">{user.qualificationLevel}</td>
                                <td className="px-5 py-5 border-b border-gray-200 bg-white text-sm text-right">
                                    <button onClick={() => handleEdit(user)} className="text-indigo-600 hover:text-indigo-900 mr-4">수정</button>
                                    <button onClick={() => handlePasswordReset(user.email)} className="text-red-600 hover:text-red-900">비밀번호 초기화</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden space-y-4">
                {users.map(user => (
                    <div key={user.id} className="bg-white shadow-md rounded-lg p-4">
                        <div className="font-bold text-lg">{user.name}</div>
                        <div className="text-sm text-gray-600">{user.email}</div>
                        <div className="text-sm text-gray-600">{user.organization} - {user.qualificationLevel}</div>
                        <div className="mt-4 pt-4 border-t flex justify-end space-x-4">
                            <button onClick={() => handleEdit(user)} className="text-indigo-600 hover:text-indigo-900">수정</button>
                            <button onClick={() => handlePasswordReset(user.email)} className="text-red-600 hover:text-red-900">비밀번호 초기화</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function UserModal({ user, onClose }) {
    const isEditing = user !== null;
    const [formData, setFormData] = useState({ email: user?.email || '', password: '', name: user?.name || '', organization: user?.organization || '', position: user?.position || '', qualificationLevel: user?.qualificationLevel || '분석원', });
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const qualificationLevels = ['시료채취원', '기술책임자', '분석원', '분석보조원', '관리자', '해수부', '협회'];

    const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!isEditing && (!formData.password || formData.password.length < 6)) { setError("신규 사용자는 6자 이상의 비밀번호를 입력해야 합니다."); return; }
        setIsSubmitting(true);
        try {
            if (isEditing) {
                const userRef = doc(db, `/artifacts/${appId}/public/data/users`, user.id);
                const { email, password, ...updateData } = formData;
                await updateDoc(userRef, updateData);
                onClose("사용자 정보가 성공적으로 수정되었습니다.");
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                const newUser = userCredential.user;
                const { password, ...userDataToSave } = formData;
                await setDoc(doc(db, `/artifacts/${appId}/public/data/users`, newUser.uid), { ...userDataToSave, uid: newUser.uid });
                onClose("신규 사용자가 성공적으로 추가되었습니다.");
            }
        } catch (error) {
            setError(`작업에 실패했습니다: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 sm:p-8 w-full max-w-md">
                <h3 className="text-xl font-bold mb-6">{isEditing ? '회원 정보 수정' : '신규 회원 추가'}</h3>
                {error && <p className="text-red-500 text-sm bg-red-100 p-2 rounded mb-4">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="이메일" required disabled={isEditing} className="w-full p-2 border rounded-md disabled:bg-gray-100" />
                    {!isEditing && <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="비밀번호 (6자 이상)" required className="w-full p-2 border rounded-md" />}
                    <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="이름" required className="w-full p-2 border rounded-md" />
                    <input type="text" name="organization" value={formData.organization} onChange={handleChange} placeholder="소속 기관" required className="w-full p-2 border rounded-md" />
                    <input type="text" name="position" value={formData.position} onChange={handleChange} placeholder="직급" required className="w-full p-2 border rounded-md" />
                    <div><label className="block text-sm font-medium text-gray-700">자격 등급</label><select name="qualificationLevel" value={formData.qualificationLevel} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">{qualificationLevels.map(level => <option key={level} value={level}>{level}</option>)}</select></div>
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={() => onClose()} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">취소</button>
                        <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">{isSubmitting ? '저장 중...' : '저장'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

