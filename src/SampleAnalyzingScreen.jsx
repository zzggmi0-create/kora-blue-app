import React, { useState } from 'react';

function SampleAnalyzingScreen({ sample, userData, location, showMessage, setSelectedSample, onBack }) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openSections, setOpenSections] = useState(['분석시작', '핵종분석결과']);
    const [nuclideResults, setNuclideResults] = useState([
        { id: 1, name: '', concentration: '', uncertainty: '', mdaChecked: false }
    ]);

    const addNuclideRow = () => {
        setNuclideResults(prev => [
            ...prev,
            { id: Date.now(), name: '', concentration: '', uncertainty: '', mdaChecked: false }
        ]);
    };

    const removeNuclideRow = (id) => {
        setNuclideResults(prev => prev.filter(row => row.id !== id));
    };

    const handleNuclideChange = (id, field, value) => {
        setNuclideResults(prev =>
            prev.map(row => (row.id === id ? { ...row, [field]: value } : row))
        );
    };

    const handleMdaChange = (id) => {
        setNuclideResults(prev =>
            prev.map(row =>
                row.id === id ? { ...row, mdaChecked: !row.mdaChecked } : row
            )
        );
    };

    const toggleSection = (sectionName) => {
        setOpenSections(prev =>
            prev.includes(sectionName)
                ? prev.filter(s => s !== sectionName)
                : [...prev, sectionName]
        );
    };

    const handleComplete = async () => {
        setIsSubmitting(true);
        try {
            const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);
            const currentHistory = sample.history || [];
            await updateDoc(sampleRef, {
                status: 'analysis_done',
                history: [
                    ...currentHistory,
                    {
                        action: '분석완료',
                        actor: userData.name,
                        timestamp: Timestamp.now(),
                        location: location || null,
                    }
                ]
            });
            showMessage({ text: "분석이 완료되었습니다.", type: 'success' });
            setSelectedSample(null);
        } catch (error) {
            console.error("Error updating document: ", error);
            showMessage({ text: "분석 완료 처리에 실패했습니다.", type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const receptionHistory = sample.history?.find(h => h.action === '시료접수');
    const receiveHistory = sample.history?.find(h => h.action === '시료수령');
    const prepStartEntry = sample.history?.find(h => h.action === '시료전처리');
    const prepDoneEntry = sample.history?.find(h => h.action === '전처리완료');
    const analysisStartEntry = sample.history?.find(h => h.action === '분석시작');
    const analysisStartTime = analysisStartEntry ? analysisStartEntry.timestamp.toDate() : null;

    const renderDetailRow = (label, value) => {
        if (value === null || value === undefined || value === '') return null;
        return (
            <div className="flex border-t py-2">
                <strong className="w-32 text-gray-500 flex-shrink-0">{label}:</strong>
                <span className="text-gray-800 break-all">{value}</span>
            </div>
        );
    };

    const renderHistorySection = (title, data, photos) => {
        const isOpen = openSections.includes(title);
        return (
            <div className="border rounded-md">
                <button onClick={() => toggleSection(title)} className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100">
                    <span className="font-semibold">{title} 정보</span>
                    <span>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                    <div className="p-4 border-t text-sm">
                        {data.map(item => renderDetailRow(item.label, item.value))}
                        {photos && photos.length > 0 && (
                            <div className="pt-2">
                                <strong className="w-32 text-gray-500 flex-shrink-0">사진:</strong>
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

    const receptionData = [
        { label: '시료 ID', value: sample.sampleCode },
        { label: '품목명', value: sample.itemName },
        { label: '시료분류', value: sample.type },
        { label: '시료량', value: `${sample.sampleAmount} ${sample.sampleAmountUnit || 'kg'}` },
        { label: '채취일시', value: sample.datetime ? new Date(sample.datetime).toLocaleString() : 'N/A' },
        { label: '채취장소', value: sample.location },
        { label: '채취자', value: sample.sampler },
        { label: '채취자 연락처', value: sample.samplerContact },
        { label: '채취기관', value: sample.samplingOrg },
        { label: '접수기관', value: sample.lab },
        { label: '추가정보', value: sample.etc },
        { label: '접수 특이사항', value: sample.receptionInfo },
        { label: '접수자', value: receptionHistory?.actor },
        { label: '접수일시', value: receptionHistory?.timestamp.toDate().toLocaleString() },
        { label: '접수자 서명', value: receptionHistory?.signature ? `${receptionHistory.signature.name} (${receptionHistory.signature.timestamp})` : null },
    ];

    const receiveData = [
        { label: '수령자', value: receiveHistory?.actor },
        { label: '수령일시', value: receiveHistory?.timestamp.toDate().toLocaleString() },
        { label: '수령자 서명', value: receiveHistory?.signature ? `${receiveHistory.signature.name} (${receiveHistory.signature.timestamp})` : null },
        { label: '분석 분류', value: (
            <ul className="list-disc pl-5">
                {(receiveHistory?.classifications || []).map((c, i) => <li key={i}>{c.type}: {c.quantity}개</li>)}
            </ul>
        )},
    ];

    const prepStartData = [
        { label: '담당자', value: prepStartEntry?.actor },
        { label: '시작일시', value: prepStartEntry?.details?.startTime ? new Date(prepStartEntry.details.startTime).toLocaleString() : 'N/A' },
        { label: '서명', value: prepStartEntry?.signature ? `${prepStartEntry.signature.name} (${prepStartEntry.signature.timestamp})` : null },
    ];
    
    const prepDoneData = [
        { label: '담당자', value: prepDoneEntry?.actor },
        { label: '종료일시', value: prepDoneEntry?.details?.endTime ? new Date(prepDoneEntry.details.endTime).toLocaleString() : 'N/A' },
        { label: '시료조제무게', value: prepDoneEntry?.details ? `${prepDoneEntry.details.preparedWeight} ${prepDoneEntry.details.preparedWeightUnit}` : null },
        { label: '서명', value: prepDoneEntry?.signature ? `${prepDoneEntry.signature.name} (${prepDoneEntry.signature.timestamp})` : null },
    ];

    const analysisStartData = [
        { label: '담당자', value: analysisStartEntry?.actor },
        { label: '분석 장비', value: analysisStartEntry?.details?.equipmentName },
        { label: '분석 시작 시간', value: analysisStartTime ? analysisStartTime.toLocaleString() : '정보 없음' },
        { label: '서명', value: analysisStartEntry?.signature ? `${analysisStartEntry.signature.name} (${analysisStartEntry.signature.timestamp})` : null },
    ];

    return (
        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-4xl mx-auto">
            <button onClick={onBack} className="mb-4 text-blue-600 hover:underline">← 목록으로 돌아가기</button>
            <h2 className="text-2xl font-bold mb-6">분석 진행 중 ({sample.sampleCode})</h2>
            
            <div className="space-y-2 mb-6">
                {renderHistorySection('시료접수', receptionData, sample.photoURLs)}
                {receiveHistory && renderHistorySection('시료수령', receiveData, receiveHistory?.photoURLs)}
                {prepStartEntry && renderHistorySection('시료전처리 시작', prepStartData, [])}
                {prepDoneEntry && renderHistorySection('전처리완료', prepDoneData, prepDoneEntry?.photoURLs)}
                {analysisStartEntry && renderHistorySection('분석시작', analysisStartData, [])}

                <div className="border rounded-md">
                    <button onClick={() => toggleSection('핵종분석결과')} className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100">
                        <span className="font-semibold">핵종분석결과</span>
                        <span>{openSections.includes('핵종분석결과') ? '▲' : '▼'}</span>
                    </button>
                    {openSections.includes('핵종분석결과') && (
                        <div className="p-4 border-t text-sm">
                            <div className="space-y-2">
                                <div className="grid grid-cols-12 gap-2 font-semibold">
                                    <div className="col-span-3">핵종명</div>
                                    <div className="col-span-1">MDA</div>
                                    <div className="col-span-6">방사능농도 ± 불확도</div>
                                    <div className="col-span-2"></div>
                                </div>
                                {nuclideResults.map((row, index) => (
                                    <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                                        <div className="col-span-3">
                                            <input
                                                type="text"
                                                value={row.name}
                                                onChange={(e) => handleNuclideChange(row.id, 'name', e.target.value)}
                                                className="w-full p-1 border rounded"
                                            />
                                        </div>
                                        <div className="col-span-1 flex justify-center">
                                            <input
                                                type="checkbox"
                                                checked={row.mdaChecked}
                                                onChange={() => handleMdaChange(row.id)}
                                                className="h-5 w-5"
                                            />
                                        </div>
                                        <div className="col-span-6 flex items-center gap-1">
                                            {row.mdaChecked ? (
                                                <>
                                                    <span className="font-semibold text-gray-500">{'<'}</span>
                                                    <input
                                                        type="text"
                                                        value={row.concentration}
                                                        onChange={(e) => handleNuclideChange(row.id, 'concentration', e.target.value)}
                                                        className="w-full p-1 border rounded"
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <input
                                                        type="text"
                                                        value={row.concentration}
                                                        onChange={(e) => handleNuclideChange(row.id, 'concentration', e.target.value)}
                                                        className="w-1/2 p-1 border rounded"
                                                    />
                                                    <span className="font-semibold text-gray-500">±</span>
                                                    <input
                                                        type="text"
                                                        value={row.uncertainty}
                                                        onChange={(e) => handleNuclideChange(row.id, 'uncertainty', e.target.value)}
                                                        className="w-1/2 p-1 border rounded"
                                                    />
                                                </>
                                            )}
                                        </div>
                                        <div className="col-span-2">
                                            {index > 0 && (
                                                <button onClick={() => removeNuclideRow(row.id)} className="px-2 py-1 bg-red-500 text-white rounded text-xs">삭제</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={addNuclideRow} className="mt-3 px-3 py-1 bg-blue-500 text-white rounded text-sm">
                                핵종 추가
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 border rounded-lg bg-blue-50 mb-6">
                <h3 className="font-semibold text-lg mb-2">현재 상태: 분석중</h3>
                {analysisStartTime && (
                    <div className="font-bold text-blue-600">
                        경과 시간: {formatDuration(analysisStartTime, new Date())}
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t">
                <button type="button" onClick={onBack} className="px-4 py-2 bg-gray-200 rounded-md">뒤로</button>
                <button type="button" onClick={handleComplete} disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white rounded-md disabled:bg-gray-400">
                    {isSubmitting ? '처리 중...' : '분석 완료'}
                </button>
            </div>
        </div>
    );
}

// Helper function to calculate duration, can be moved to a utils file
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


export default SampleAnalyzingScreen;