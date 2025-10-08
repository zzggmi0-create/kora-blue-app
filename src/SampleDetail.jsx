import React, { useState } from 'react';
import AnalysisResult from './AnalysisResult';
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';

const AccordionItem = ({ title, data, isOpen, onToggle }) => {
  return (
    <div className="border-b">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 bg-gray-100 hover:bg-gray-200 focus:outline-none"
      >
        <h3 className="text-lg font-semibold">{title}</h3>
      </button>
      {isOpen && (
        <div className="p-4 bg-white">
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(data).map(([key, value]) => {
              if (key === 'photoURLs' && Array.isArray(value)) {
                return (
                  <div key={key} className="col-span-2">
                    <p className="font-semibold">{key}:</p>
                    <div className="flex space-x-4 mt-2">
                      {value.map((url, index) => (
                        <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`photo ${index + 1}`} className="w-32 h-32 object-cover rounded-lg" />
                        </a>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <p key={key}><span className="font-semibold">{key}:</span> {String(value)}</p>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

function SampleDetail({ sample, userData, onBack, db, appId }) {
  const [openIndex, setOpenIndex] = useState(sample.history.length - 1);

  const handleToggle = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const [isSigned, setIsSigned] = useState(sample.history.some(h => h.action === '전자결재' && h.actor === userData.name));
  const [isSigning, setIsSigning] = useState(false);

  const handleSign = async () => {
    setIsSigning(true);
    const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);
    const now = new Date();
    const formattedTimestamp =
        `${String(now.getFullYear()).slice(2)}.` +
        `${String(now.getMonth() + 1).padStart(2, '0')}.` +
        `${String(now.getDate()).padStart(2, '0')} ` +
        `${String(now.getHours()).padStart(2, '0')}:` +
        `${String(now.getMinutes()).padStart(2, '0')}`;

    const newHistoryEntry = {
        action: '전자결재',
        actor: userData.name,
        timestamp: Timestamp.now(),
        signature: { name: userData.name, timestamp: formattedTimestamp },
    };

    try {
        await updateDoc(sampleRef, {
            history: arrayUnion(newHistoryEntry)
        });
        setIsSigned(true);
        alert('서명이 완료되었습니다.');
    } catch (error) {
        console.error("Error signing document: ", error);
        alert(`서명에 실패했습니다: ${error.message}`);
    } finally {
        setIsSigning(false);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-blue-600 hover:underline">← 목록으로 돌아가기</button>
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold mb-4">시료 상세 정보: {sample.sampleCode}</h2>
        
        {/* 작업 1: 분석 이력 아코디언 */}
        <div className="mb-8">
            <h3 className="text-xl font-bold mb-2">처리 이력</h3>
            <div className="border rounded-lg overflow-hidden">
                {sample.history.map((item, index) => (
                    <AccordionItem
                        key={index}
                        title={`${index + 1}. ${item.action}`}
                data={{
                            '담당자': item.actor,
                            '시간': item.timestamp.toDate().toLocaleString(),
                            '위치': item.location ? `${item.location.lat}, ${item.location.lon}` : 'N/A',
                            '서명': item.signature ? `${item.signature.name} (${item.signature.timestamp})` : 'N/A',
                            ...(item.photoURLs && item.photoURLs.length > 0 && {'photoURLs': item.photoURLs})
                        }}
                        isOpen={index === openIndex}
                        onToggle={() => handleToggle(index)}
                    />
                ))}
            </div>
        </div>

        {/* 작업 2: 핵종분석결과 */}
        <div className="mb-8">
            <AnalysisResult 
                initialResults={sample.analysisResults || undefined}
                onSave={async (results) => {
                    const sampleRef = doc(db, `/artifacts/${appId}/public/data/samples`, sample.id);
                    const now = new Date();
                    const formattedTimestamp =
                        `${String(now.getFullYear()).slice(2)}.` +
                        `${String(now.getMonth() + 1).padStart(2, '0')}.` +
                        `${String(now.getDate()).padStart(2, '0')} ` +
                        `${String(now.getHours()).padStart(2, '0')}:` +
                        `${String(now.getMinutes()).padStart(2, '0')}`;

                    const newHistoryEntry = {
                        action: '핵종분석결과 저장',
                        actor: userData.name,
                        timestamp: Timestamp.now(),
                        signature: { name: userData.name, timestamp: formattedTimestamp },
                        results: results,
                    };

                    try {
                        await updateDoc(sampleRef, {
                            analysisResults: results,
                            history: arrayUnion(newHistoryEntry)
                        });
                        alert('분석 결과가 성공적으로 저장되었습니다.');
                    } catch (error) {
                        console.error("Error updating document: ", error);
                        alert(`결과 저장에 실패했습니다: ${error.message}`);
                    }
                }}
            />
        </div>

        {/* 작업 3: 전자결재 */}
        <div>
            <h3 className="text-xl font-bold mb-2">전자결재</h3>
            <button 
                onClick={handleSign} 
                disabled={isSigned || isSigning}
                className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
            >
                {isSigned ? `서명 완료 (${userData.name})` : (isSigning ? '서명 중...' : '서명하기')}
            </button>
        </div>

      </div>
    </div>
  );
}

export default SampleDetail;
