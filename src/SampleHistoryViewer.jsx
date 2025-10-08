import React, { useState } from 'react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';

export default function SampleHistoryViewer({ sample, db, appId, userData }) {
    const allSections = ['시료접수', '시료수령', '시료전처리 시작', '전처리완료', '분석시작', '핵종분석결과'];
    const [openSections, setOpenSections] = useState(allSections);
    const [isEditing, setIsEditing] = useState(false);
    const [editableSample, setEditableSample] = useState(JSON.parse(JSON.stringify(sample)));
    const [modificationReason, setModificationReason] = useState('');

    const toggleSection = (sectionName) => {
        setOpenSections(prev =>
            prev.includes(sectionName)
                ? prev.filter(s => s !== sectionName)
                : [...prev, sectionName]
        );
    };

    const handleEditableChange = (field, value) => {
        setEditableSample(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!modificationReason) {
            alert('수정 사유를 입력해야 합니다.');
            return;
        }
        if (!db || !appId || !userData) {
            alert('저장 기능이 올바르게 연결되지 않았습니다.');
            return;
        }

        const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);
        const newModificationHistory = [...(sample.modificationHistory || []), { reason: modificationReason, editor: userData.name, timestamp: Timestamp.now() }];
        try {
            await updateDoc(sampleRef, { ...editableSample, modificationHistory: newModificationHistory });
            alert('수정 내용이 저장되었습니다.');
            setIsEditing(false);
            setModificationReason('');
        } catch (error) {
            console.error("Error updating document: ", error);
            alert('저장에 실패했습니다.');
        }
    };

    const renderDetailRow = (item) => (
        <div key={item.label} className="flex border-t py-2 items-center">
            <strong className="w-40 text-gray-500 flex-shrink-0">{item.label}:</strong>
            {isEditing && item.isEditable ? (
                <input type="text" value={item.value} onChange={(e) => handleEditableChange(item.field, e.target.value)} className="text-gray-800 break-all w-full p-1 border rounded" />
            ) : (
                <span className="text-gray-800 break-all">{String(item.value)}</span>
            )}
        </div>
    );

    const renderHistorySection = (title, data, photos) => {
        if (!data || data.length === 0) return null;
        const isOpen = openSections.includes(title);
        return (
            <div className="border rounded-md">
                <button onClick={() => toggleSection(title)} className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100">
                    <span className="font-semibold">{title} 정보</span>
                    <span>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                    <div className="p-4 border-t text-sm">
                        {data.map(renderDetailRow)}
                        {photos && photos.length > 0 && (
                            <div className="pt-4 mt-4 border-t">
                                <strong className="text-gray-500">사진:</strong>
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    {photos.map((url, index) => (
                                        <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                                            <img src={url} alt={`${title} 사진 ${index + 1}`} className="w-full h-auto max-h-48 object-contain rounded-lg border"/>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const receptionHistory = sample.history?.find(h => h.action === '시료접수');
    const receiveHistory = sample.history?.find(h => h.action === '시료수령');
    const prepStartEntry = sample.history?.find(h => h.action === '시료전처리');
    const prepDoneEntry = sample.history?.find(h => h.action === '전처리완료');
    const analysisStartEntry = sample.history?.find(h => h.action === '분석시작');
    const analysisDoneEntry = sample.history?.find(h => h.action === '분석완료');
    const nuclideResults = analysisDoneEntry?.details?.nuclideResults || [];
    const analystSignature = analysisDoneEntry?.details?.analystSignature;

    const receptionData = receptionHistory ? [
        { label: '시료 ID', value: editableSample.sampleCode, field: 'sampleCode', isEditable: true },
        { label: '품목명', value: editableSample.itemName, field: 'itemName', isEditable: true },
        { label: '시료분류', value: editableSample.type, field: 'type', isEditable: true },
        { label: '시료량', value: `${editableSample.sampleAmount} ${editableSample.sampleAmountUnit || 'kg'}`, field: 'sampleAmount', isEditable: true },
        { label: '채취일시', value: editableSample.datetime ? new Date(editableSample.datetime).toLocaleString() : 'N/A', field: 'datetime', isEditable: true },
        { label: '채취장소', value: editableSample.location, field: 'location', isEditable: true },
        { label: '채취자', value: editableSample.sampler, field: 'sampler', isEditable: true },
        { label: '접수자', value: receptionHistory.actor },
        { label: '접수일시', value: receptionHistory.timestamp && typeof receptionHistory.timestamp.toDate === 'function' ? receptionHistory.timestamp.toDate().toLocaleString() : 'N/A' },
    ] : [];

    const receiveData = receiveHistory ? [ { label: '수령자', value: receiveHistory.actor }, { label: '수령일시', value: receiveHistory.timestamp && typeof receiveHistory.timestamp.toDate === 'function' ? receiveHistory.timestamp.toDate().toLocaleString() : 'N/A' } ] : [];
    const prepStartData = prepStartEntry ? [ { label: '담당자', value: prepStartEntry.actor }, { label: '시작일시', value: prepStartEntry.details?.startTime ? new Date(prepStartEntry.details.startTime).toLocaleString() : 'N/A' } ] : [];
    const prepDoneData = prepDoneEntry ? [ { label: '담당자', value: prepDoneEntry.actor }, { label: '종료일시', value: prepDoneEntry.details?.endTime ? new Date(prepDoneEntry.details.endTime).toLocaleString() : 'N/A' } ] : [];
    const analysisStartData = analysisStartEntry ? [ { label: '담당자', value: analysisStartEntry.actor }, { label: '분석 장비', value: analysisStartEntry.details?.equipmentName }, { label: '분석 시작', value: analysisStartEntry.timestamp && typeof analysisStartEntry.timestamp.toDate === 'function' ? analysisStartEntry.timestamp.toDate().toLocaleString() : 'N/A' } ] : [];

    return (
        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">시료 전체 이력 ({sample.sampleCode})</h2>
            
            <div className="space-y-2">
                {renderHistorySection('시료접수', receptionData, sample.photoURLs)}
                {renderHistorySection('시료수령', receiveData, receiveHistory?.photoURLs)}
                {renderHistorySection('시료전처리 시작', prepStartData, [])}
                {renderHistorySection('전처리완료', prepDoneData, prepDoneEntry?.photoURLs)}
                {renderHistorySection('분석시작', analysisStartData, [])}
                {analysisDoneEntry && (
                    <div className="border rounded-md">
                        <button onClick={() => toggleSection('핵종분석결과')} className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100">
                            <span className="font-semibold">핵종분석결과</span>
                            <span>{openSections.includes('핵종분석결과') ? '▲' : '▼'}</span>
                        </button>
                        {openSections.includes('핵종분석결과') && (
                            <div className="p-4 border-t text-sm">
                                {/* Nuclide results table and signature */}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {isEditing && (
                <div className="my-6 p-4 border rounded-md bg-yellow-50">
                    <label className="font-semibold">수정 사유 *</label>
                    <textarea value={modificationReason} onChange={(e) => setModificationReason(e.target.value)} className="w-full p-2 border rounded mt-1" rows="2"></textarea>
                    <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
                        <h4 className="font-semibold">수정 이력:</h4>
                        {(sample.modificationHistory || []).map((h, i) => <p key={i}>{h.timestamp && typeof h.timestamp.toDate === 'function' ? new Date(h.timestamp.toDate()).toLocaleString() : 'N/A'} by {h.editor}: {h.reason}</p>)}
                    </div>
                </div>
            )}

            <div className="sticky bottom-0 bg-white py-4 border-t mt-6">
                <div className="flex justify-end max-w-4xl mx-auto gap-4">
                    {isEditing ? (
                        <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded-md">저장</button>
                    ) : (
                        <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-yellow-500 text-white rounded-md">수정</button>
                    )}
                    <button onClick={() => isEditing ? setIsEditing(false) : window.close()} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">
                        {isEditing ? '취소' : '닫기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
