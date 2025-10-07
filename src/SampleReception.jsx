// 시료접수하기 기능
import React, { useState, useEffect } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

/**
 * 시료 접수 컴포넌트
 * @param {object} props - 컴포넌트 프로퍼티
 * @param {object} props.userData - 현재 로그인된 사용자 정보
 * @param {string[]} props.officeList - DB에서 가져온 검사소 목록
 * @param {object} props.db - Firestore 데이터베이스 인스턴스
 * @param {string} props.appId - Firebase 앱 ID
 */
const SampleReception = ({ userData, officeList = [], db, appId }) => {
  // --- 상태 관리 ---

  const currentUser = userData || {
    name: '사용자명 없음',
    contact: '연락처 없음',
    qualificationLevel: '권한 없음',
    uid: 'unknown-uid'
  };

  const initialFormState = {
    sampleType: 'FMT',
    isAutoGenerate: true,
    sampleId: '',
    samplingTime: '',
    samplingLocation: '',
    itemName: '',
    sampleAmount: '', // 시료량 필드 추가
    receptionAgency: '',
    samplingOrg: '',
    additionalInfo: '',
    isManualSampler: false,
    sampler: '',
    samplerContact: '',
    photos: [null, null],
    location: null,
    signature: null,
    isSigned: false,
  };

  const [formState, setFormState] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // --- useEffect Hooks ---

  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    if (!formState.isManualSampler) {
      setFormState(prevState => ({
        ...prevState,
        sampler: currentUser.name,
        samplerContact: currentUser.contact || '연락처 없음',
      }));
    }
  }, [formState.isManualSampler, currentUser.name, currentUser.contact]);

  useEffect(() => {
    if (formState.isAutoGenerate) {
      setFormState(prevState => ({ ...prevState, sampleId: '' }));
    }
  }, [formState.isAutoGenerate]);

  // --- 이벤트 핸들러 ---

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setFormState(prevState => ({ ...prevState, [name]: val }));
  };

  const handleAgencyBlur = (e) => {
    const { value } = e.target;
    if (value && !officeList.includes(value)) {
      setMessage({ text: '유효하지 않은 접수기관입니다. 목록에서 선택해주세요.', type: 'error' });
      setFormState(prevState => ({ ...prevState, receptionAgency: '' }));
    }
  };

  const handleLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setFormState(prevState => ({ ...prevState, location: { lat: latitude, lon: longitude } }));
          setMessage({ text: '현재 위치가 기록되었습니다.', type: 'success' });
        },
        (error) => setMessage({ text: '위치를 가져오는 데 실패했습니다.', type: 'error' })
      );
    } else {
      setMessage({ text: '이 브라우저에서는 위치 기록을 지원하지 않습니다.', type: 'error' });
    }
  };

  const handlePhotoUpload = (event, index) => {
    const file = event.target.files[0];
    if (file) {
      setFormState(prevState => {
        const newPhotos = [...prevState.photos];
        newPhotos[index] = file;
        return { ...prevState, photos: newPhotos };
      });
    }
  };

  const handleSign = () => {
    const now = new Date();
    const formattedTimestamp =
      `${String(now.getFullYear()).slice(2)}.` +
      `${String(now.getMonth() + 1).padStart(2, '0')}.` +
      `${String(now.getDate()).padStart(2, '0')} ` +
      `${String(now.getHours()).padStart(2, '0')}:` +
      `${String(now.getMinutes()).padStart(2, '0')}`;

    setFormState(prevState => ({
      ...prevState,
      signature: { name: currentUser.name, timestamp: formattedTimestamp },
      isSigned: true,
    }));
    setMessage({ text: '서명이 완료되었습니다.', type: 'success' });
  };

  // '접수하기' 버튼 클릭 시, Firestore에 데이터 저장
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (formState.receptionAgency && !officeList.includes(formState.receptionAgency)) {
      setMessage({ text: '시료접수기관을 목록에서 선택해주세요.', type: 'error' });
      return;
    }
    if (!db) {
      setMessage({ text: '데이터베이스 연결에 실패했습니다.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    setMessage({ text: '', type: '' });

    let finalSampleId = formState.sampleId;
    if (formState.isAutoGenerate) {
      const date = new Date();
      const year = String(date.getFullYear()).slice(2);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const sequence = String(Date.now()).slice(-4); // 중복 확률이 낮은 시퀀스
      finalSampleId = `${formState.sampleType}-${year}${month}${day}-${sequence}`;
    }

    // Firestore에 저장할 데이터 모델 구성
    const newSample = {
      sampleCode: finalSampleId,
      status: 'receive_wait', // 상태를 '시료수령 대기'로 설정
      createdAt: Timestamp.now(),
      createdBy: {
        uid: currentUser.uid,
        name: currentUser.name
      },
      history: [{
        action: '시료접수',
        actor: currentUser.name,
        timestamp: Timestamp.now(),
        location: formState.location || null,
        signature: formState.signature
      }],
      type: formState.sampleType,
      itemName: formState.itemName,
      sampleAmount: formState.sampleAmount,
      lab: formState.receptionAgency,
      datetime: formState.samplingTime,
      location: formState.samplingLocation,
      samplingOrg: formState.samplingOrg,
      sampler: formState.sampler,
      samplerContact: formState.samplerContact,
      etc: formState.additionalInfo,
    };

    try {
      await addDoc(collection(db, `/artifacts/${appId}/public/data/samples`), newSample);
      setMessage({ text: `시료 접수가 완료되어 '시료수령 대기' 상태로 전환되었습니다.`, type: 'success' });
      setFormState(initialFormState); // 폼 초기화
    } catch (error) {
      console.error("Error adding document: ", error);
      setMessage({ text: `시료 접수에 실패했습니다: ${error.message}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormState(initialFormState);
    setMessage({ text: '접수가 취소되었습니다.', type: 'info' });
  };

  const formFieldsDisabled = formState.isSigned || isSubmitting;

  return (
    <div className="container mx-auto p-6 bg-gray-50 min-h-screen relative">
      {message.text && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${
          message.type === 'success' ? 'bg-green-500' :
          message.type === 'error' ? 'bg-red-500' :
          'bg-blue-500'
        }`}>
          {message.text}
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6 text-gray-800">시료 접수 정보</h1>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-lg shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ... other form fields ... */}
          <div>
            <label htmlFor="sampleType" className="block text-sm font-medium text-gray-700">시료분류</label>
            <select id="sampleType" name="sampleType" value={formState.sampleType} onChange={handleChange} disabled={formFieldsDisabled} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100">
              <option value="FMT">위판장</option>
              <option value="ACF">양식장</option>
              <option value="STL">천일염</option>
              <option value="OMP">기타</option>
            </select>
          </div>

          <div>
            <label htmlFor="sampleId" className="block text-sm font-medium text-gray-700">시료ID</label>
            <div className="mt-1 flex items-center space-x-2">
              <input type="text" id="sampleId" name="sampleId" value={formState.isAutoGenerate ? "자동생성" : formState.sampleId} onChange={handleChange} disabled={formState.isAutoGenerate || formFieldsDisabled} className="flex-grow block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100 disabled:text-gray-500"/>
              <div className="flex items-center flex-shrink-0">
                <input id="isAutoGenerate" name="isAutoGenerate" type="checkbox" checked={formState.isAutoGenerate} onChange={handleChange} disabled={formFieldsDisabled} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"/>
                <label htmlFor="isAutoGenerate" className="ml-2 block text-sm text-gray-900">자동생성</label>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="samplingTime" className="block text-sm font-medium text-gray-700">채취시간</label>
            <input type="datetime-local" id="samplingTime" name="samplingTime" value={formState.samplingTime} onChange={handleChange} disabled={formFieldsDisabled} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100"/>
          </div>

          <div>
            <label htmlFor="samplingLocation" className="block text-sm font-medium text-gray-700">채취장소</label>
            <input type="text" id="samplingLocation" name="samplingLocation" value={formState.samplingLocation} onChange={handleChange} disabled={formFieldsDisabled} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100"/>
          </div>

          <div>
            <label htmlFor="itemName" className="block text-sm font-medium text-gray-700">품목명</label>
            <input type="text" id="itemName" name="itemName" value={formState.itemName} onChange={handleChange} disabled={formFieldsDisabled} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100"/>
          </div>

          {/* 시료량 필드 추가 */}
          <div>
            <label htmlFor="sampleAmount" className="block text-sm font-medium text-gray-700">시료량 (kg)</label>
            <input type="number" id="sampleAmount" name="sampleAmount" value={formState.sampleAmount} onChange={handleChange} disabled={formFieldsDisabled} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100"/>
          </div>

          {/* 시료접수기관 (DB 연동 및 onBlur 검증) */}
          <div>
            <label htmlFor="receptionAgency" className="block text-sm font-medium text-gray-700">시료접수기관 (검사소)</label>
            <input list="agency-list" id="receptionAgency" name="receptionAgency" value={formState.receptionAgency} onChange={handleChange} onBlur={handleAgencyBlur} disabled={formFieldsDisabled} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100"/>
            <datalist id="agency-list">
              {officeList && officeList.map(agency => <option key={agency} value={agency} />)}
            </datalist>
          </div>

          {/* 추가정보 */}
          <div>
            <label htmlFor="additionalInfo" className="block text-sm font-medium text-gray-700">추가정보</label>
            <textarea id="additionalInfo" name="additionalInfo" value={formState.additionalInfo} onChange={handleChange} disabled={formFieldsDisabled} rows="1" className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100"></textarea>
          </div>

          {/* 채취자 */}
          <div>
            <label htmlFor="sampler" className="block text-sm font-medium text-gray-700">채취자</label>
            <div className="mt-1 flex items-center space-x-2">
              <input type="text" id="sampler" name="sampler" value={formState.sampler} onChange={handleChange} disabled={!formState.isManualSampler || formFieldsDisabled} className="flex-grow block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100"/>
              <div className="flex items-center flex-shrink-0">
                <input id="isManualSampler" name="isManualSampler" type="checkbox" checked={formState.isManualSampler} onChange={handleChange} disabled={formFieldsDisabled} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"/>
                <label htmlFor="isManualSampler" className="ml-2 block text-sm text-gray-900">직접입력</label>
              </div>
            </div>
          </div>

          {/* 채취자 연락처 */}
          <div>
            <label htmlFor="samplerContact" className="block text-sm font-medium text-gray-700">채취자 연락처</label>
            <input type="text" id="samplerContact" name="samplerContact" value={formState.samplerContact} onChange={handleChange} disabled={!formState.isManualSampler || formFieldsDisabled} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100"/>
          </div>

          {/* 시료채취기관 */}
          <div>
            <label htmlFor="samplingOrg" className="block text-sm font-medium text-gray-700">시료채취기관</label>
            <input type="text" id="samplingOrg" name="samplingOrg" value={formState.samplingOrg} onChange={handleChange} disabled={formFieldsDisabled} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100"/>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">위치기록</label>
          <div className="mt-1 flex items-center space-x-4">
            <button type="button" onClick={handleLocation} disabled={formFieldsDisabled} className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300">
              위치기록
            </button>
            {formState.location && (
              <a href={`https://www.google.com/maps?q=${formState.location.lat},${formState.location.lon}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                위도: {formState.location.lat.toFixed(5)}, 경도: {formState.location.lon.toFixed(5)}
              </a>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">시료사진 (최대 2건)</label>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1].map(index => (
              <div key={index} className="border p-3 rounded-md">
                <label htmlFor={`photo-${index}`} className="text-sm text-gray-600 mb-1 block">시료사진 {index + 1}</label>
                <input type="file" id={`photo-${index}`} accept="image/*" onChange={(e) => handlePhotoUpload(e, index)} disabled={formFieldsDisabled} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"/>
                {formState.photos[index] && (
                  <p className="mt-2 text-xs text-gray-500 truncate">{formState.photos[index].name}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium text-gray-900">전자결재</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center">
              {formState.signature ? (
                <div className="flex flex-col items-start">
                    <span className="text-sm font-semibold text-gray-800">{formState.signature.name}</span>
                    <span className="text-sm text-gray-600">{formState.signature.timestamp}</span>
                </div>
              ) : (
                <span className="text-sm text-gray-500">서명 대기 중</span>
              )}
            </div>
            <div className="pt-2">
              <button type="button" onClick={handleSign} disabled={formState.isSigned || isSubmitting} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-200">
                서명하기
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button type="button" onClick={handleCancel} disabled={isSubmitting} className="px-6 py-2 border border-gray-300 shadow-sm text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-200">
            취소하기
          </button>
          <button type="submit" disabled={!formState.isSigned || isSubmitting} className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
            {isSubmitting ? '접수 중...' : '접수하기'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SampleReception;
