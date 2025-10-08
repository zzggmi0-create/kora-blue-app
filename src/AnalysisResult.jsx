import React, { useState } from 'react';

function AnalysisResult({ initialResults, onSave }) {
  const [results, setResults] = useState(
    initialResults || [{ nuclide: '', mda: false, concentration: '', uncertainty: '' }]
  );

  const handleChange = (index, field, value) => {
    const newResults = [...results];
    if (field === 'mda') {
      newResults[index][field] = value;
      if (value) {
        // MDA 체크 시 농도, 불확도 초기화
        newResults[index].concentration = '';
        newResults[index].uncertainty = '';
      }
    } else {
      newResults[index][field] = value;
    }
    setResults(newResults);
  };

  const addRow = () => {
    setResults([...results, { nuclide: '', mda: false, concentration: '', uncertainty: '' }]);
  };

  const removeRow = (index) => {
    const newResults = results.filter((_, i) => i !== index);
    setResults(newResults);
  };

  const handleSave = () => {
    // 데이터 유효성 검사 등 추가 가능
    onSave(results);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border">
      <h3 className="text-xl font-bold mb-4">핵종분석결과</h3>
      <div className="space-y-4">
        {results.map((row, index) => (
          <div key={index} className="grid grid-cols-12 gap-4 items-center border-b pb-4">
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-700">핵종명</label>
              <input
                type="text"
                value={row.nuclide}
                onChange={(e) => handleChange(index, 'nuclide', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div className="col-span-2 flex items-center mt-6">
              <input
                type="checkbox"
                checked={row.mda}
                onChange={(e) => handleChange(index, 'mda', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <label className="ml-2 block text-sm text-gray-900">MDA</label>
            </div>
            <div className="col-span-5">
              <label className="block text-sm font-medium text-gray-700">방사능농도</label>
              <div className="flex items-center">
                {row.mda ? (
                  <span className="text-lg font-semibold mr-2">&lt;</span>
                ) : (
                  <>
                    <input
                      type="text"
                      value={row.concentration}
                      onChange={(e) => handleChange(index, 'concentration', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      disabled={row.mda}
                    />
                    <span className="mx-2">±</span>
                    <input
                      type="text"
                      value={row.uncertainty}
                      onChange={(e) => handleChange(index, 'uncertainty', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      disabled={row.mda}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="col-span-2 flex items-center mt-6">
              <button
                onClick={() => removeRow(index)}
                className="text-red-600 hover:text-red-800"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <button
          onClick={addRow}
          className="text-indigo-600 hover:text-indigo-800"
        >
          + 핵종 추가
        </button>
      </div>
      <div className="mt-6 text-right">
        <button
          onClick={handleSave}
          className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700"
        >
          결과 저장
        </button>
      </div>
    </div>
  );
}

export default AnalysisResult;
