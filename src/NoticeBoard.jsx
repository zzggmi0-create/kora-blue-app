import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    doc, 
    setDoc, 
    getDocs,
    onSnapshot,     
    query, 
    where, 
    updateDoc,
    deleteDoc,
    orderBy,
    Timestamp
} from 'firebase/firestore';
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from 'firebase/storage';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  };

let app;
try {
    app = initializeApp(firebaseConfig);
} catch (error) {
    //
}

const db = getFirestore(app);
const storage = getStorage(app);
const appId = 'default-kora-blue-app';

function NoticeForm({ userData, onClose, setMessage }) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [files, setFiles] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files.length > 2) {
            setMessage("파일은 최대 2개까지 첨부할 수 있습니다.");
            e.target.value = null;
            setFiles([]);
            return;
        }
        setFiles(Array.from(e.target.files));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title || !content) { setMessage("제목과 내용을 모두 입력해주세요."); return; }
        setIsSubmitting(true);
        try {
            const noticeRef = doc(collection(db, `/artifacts/${appId}/public/data/notices`));
            const attachments = await Promise.all(
                files.map(async (file) => {
                    const storageRef = ref(storage, `notices/${noticeRef.id}/${file.name}`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    return { name: file.name, url };
                })
            );
            
            await setDoc(noticeRef, { 
                title, 
                content, 
                attachments, 
                authorId: userData.uid, 
                authorName: userData.displayName || userData.email, 
                createdAt: Timestamp.now() 
            });
            setMessage("공지사항이 성공적으로 등록되었습니다.");
            onClose();
        } catch (error) {
            setMessage(`등록 실패: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">새 공지 작성</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" required className="w-full p-2 border rounded-md" />
                <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="내용" required rows="10" className="w-full p-2 border rounded-md"></textarea>
                <input type="file" multiple onChange={handleFileChange} className="w-full" />
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">취소</button>
                    <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">{isSubmitting ? '등록 중...' : '등록'}</button>
                </div>
            </form>
        </div>
    );
}

export default function NoticeBoard({ userData }) {
    const [notices, setNotices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedNotice, setSelectedNotice] = useState(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [message, setMessage] = useState('');
    const canWrite = ['관리자', '협회'].includes(userData.qualificationLevel);

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

    const handleDelete = async (noticeId) => {
        if (!window.confirm("정말로 이 공지사항을 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, `/artifacts/${appId}/public/data/notices`, noticeId));
            setMessage("공지사항이 삭제되었습니다.");
            setSelectedNotice(null);
        } catch (error) {
            setMessage(`삭제 실패: ${error.message}`);
        }
    };

    if (isLoading) return <div>공지사항을 불러오는 중...</div>;

    if (isFormOpen) return <NoticeForm userData={userData} onClose={() => setIsFormOpen(false)} setMessage={setMessage} />;

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
                    {canWrite && <button onClick={() => handleDelete(selectedNotice.id)} className="mt-6 bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600">삭제</button>}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">공지사항</h2>
                {canWrite && <button onClick={() => setIsFormOpen(true)} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">새 공지 작성</button>}
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
