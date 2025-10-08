import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import SampleReception from './SampleReception';
import SampleAnalyzingScreen from './SampleAnalyzingScreen';

function AnalysisManagement({ db, appId, userData, storage, setPage }) {
  const [samples, setSamples] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSample, setSelectedSample] = useState(null);
  const [currentStep, setCurrentStep] = useState('list'); // 'list', 'reception', 'details'

  useEffect(() => {
    if (!userData.inspectionOffice || userData.inspectionOffice.length === 0) {
      setError('소속된 검사소가 없어 데이터를 조회할 수 없습니다.');
      setIsLoading(false);
      return;
    }

    const samplesRef = collection(db, `/artifacts/${appId}/public/data/samples`);
    const q = query(
      samplesRef,
      where('lab', 'in', userData.inspectionOffice),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sampleList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSamples(sampleList);
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching samples:", err);
      setError('시료 목록을 불러오는 데 실패했습니다.');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [db, appId, userData.inspectionOffice]);

  const handleRowClick = (sample) => {
    setSelectedSample(sample);
    setCurrentStep('details');
  };
  
  const renderStepContent = () => {
    switch (currentStep) {
      case 'reception':
        return <SampleReception userData={userData} officeList={userData.inspectionOffice} db={db} appId={appId} storage={storage} />;
      case 'details':
        if (selectedSample && selectedSample.status === 'analyzing') {
          return <SampleAnalyzingScreen sample={selectedSample} onBack={() => setCurrentStep('list')} />;
        }
        return <div>상세 보기 컴포넌트가 필요합니다.</div>;
      case 'list':
      default:
        return (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">분석관리</h2>
              <button onClick={() => setCurrentStep('reception')} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">
                시료접수
              </button>
            </div>
            {isLoading && <p>시료 목록을 불러오는 중...</p>}
            {error && <p className="text-red-500">{error}</p>}
            {!isLoading && !error && (
              <div className="overflow-x-auto bg-white rounded-lg shadow">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">시료 ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">품목명</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">접수일</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {samples.map(sample => (
                      <tr key={sample.id} onClick={() => handleRowClick(sample)} className="hover:bg-gray-100 cursor-pointer">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sample.sampleCode}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sample.itemName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sample.status}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sample.createdAt?.toDate().toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div>
      {renderStepContent()}
    </div>
  );
}

export default AnalysisManagement;