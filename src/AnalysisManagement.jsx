import React, { useState, useRef } from 'react';
import { jsPDF } from "jspdf";
import html2canvas from 'html2canvas';

// 각 섹션의 제목을 위한 컴포넌트
const SectionTitle = ({ children }) => <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-300">{children}</h2>;

// 정보 표시를 위한 컴포넌트
const InfoItem = ({ label, value, isEditing, onChange, name }) => (
    <div className="grid grid-cols-3 gap-4 items-center">
        <span className="font-semibold text-gray-600 text-right">{label}</span>
        {isEditing ? (
            <input
                type="text"
                name={name}
                value={value}
                onChange={onChange}
                className="col-span-2 p-2 border rounded-md"
            />
        ) : (
            <span className="col-span-2 text-gray-800">{value}</span>
        )}
    </div>
);

// 이전 단계 정보 섹션
const PreviousStepInfo = () => (
    <div>
        <SectionTitle>이전 단계 정보</SectionTitle>
        <div className="space-y-2">
            <p>시료접수: 2025-10-08 10:00 / 홍길동</p>
            <p>시료전처리: 2025-10-08 11:00 / 김철수</p>
            <p>분석: 2025-10-08 12:00 / 이영희</p>
        </div>
    </div>
);

// 데이터 업로드 섹션
const DataUploadSection = () => (
    <div className="mt-6">
        <SectionTitle>데이터 업로드</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">TXT 파일</label>
                <input type="file" accept=".txt" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PDF 파일</label>
                <input type="file" accept=".pdf" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이미지 파일</label>
                <input type="file" accept="image/*" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"/>
            </div>
        </div>
    </div>
);

// 수정 사유 섹션
const EditReasonSection = ({ isEditing, editReason, setEditReason, editHistory }) => (
    <div className="mt-6">
        <SectionTitle>수정 사유</SectionTitle>
        {isEditing && (
            <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="수정 사유를 입력하세요..."
                className="w-full p-2 border rounded-md"
            />
        )}
        <div className="mt-2 text-sm text-gray-600 space-y-1">
            {editHistory.map((reason, index) => (
                <p key={index}>- {reason}</p>
            ))}
        </div>
    </div>
);


// 메인 컴포넌트
function AnalysisManagement({ userData }) {
    const [showReportSection, setShowReportSection] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editReason, setEditReason] = useState('');
    const [editHistory, setEditHistory] = useState([]);
    const [analysisData, setAnalysisData] = useState({
        sampleId: 'FMT-251008-1234',
        itemName: '고등어',
        receptionDate: '2025-10-08 09:00',
        analysisDate: '2025-10-08 13:00',
        analyst: '김분석',
    });

    const reportRef = useRef();

    const handleDataChange = (e) => {
        const { name, value } = e.target;
        setAnalysisData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        if (isEditing) {
            if (editReason.trim() === '') {
                alert('수정 사유를 입력해야 합니다.');
                return;
            }
            const timestamp = new Date().toLocaleString();
            setEditHistory(prev => [...prev, `[${timestamp}] ${editReason}`]);
            setEditReason('');
        }
        setIsEditing(!isEditing);
    };

    const generatePdf = () => {
        const input = reportRef.current;
        html2canvas(input, { scale: 2 }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasWidth / canvasHeight;
            const width = pdfWidth;
            const height = width / ratio;

            // Check if content height is larger than page height
            if (height > pdfHeight) {
                 // This is a simple approach. For multi-page, more logic is needed.
                 console.warn("콘텐츠가 페이지보다 깁니다. PDF가 잘릴 수 있습니다.");
            }
            
            pdf.addImage(imgData, 'PNG', 0, 0, width, height);
            pdf.save("예비결과서_레포트.pdf");
        });
    };

    const printReport = () => {
        const input = reportRef.current;
        html2canvas(input, { scale: 2 }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const printWindow = window.open('', '_blank');
            printWindow.document.write('<html><head><title>예비결과서 레포트 출력</title></head><body>');
            printWindow.document.write('<img src="' + imgData + '" style="width:100%;">');
            printWindow.document.write('</body></html>');
            printWindow.document.close();
            printWindow.print();
        });
    };

    return (
        <div className="container mx-auto p-6 bg-white rounded-lg shadow-lg">
            <h1 className="text-3xl font-bold mb-6 text-center text-indigo-700">분석완료 정보</h1>

            <div className="space-y-8">
                <PreviousStepInfo />

                <div>
                    <SectionTitle>분석 정보</SectionTitle>
                    <div className="space-y-3 p-4 border rounded-md bg-gray-50">
                        <InfoItem label="시료 ID" name="sampleId" value={analysisData.sampleId} isEditing={isEditing} onChange={handleDataChange} />
                        <InfoItem label="품목명" name="itemName" value={analysisData.itemName} isEditing={isEditing} onChange={handleDataChange} />
                        <InfoItem label="접수일시" name="receptionDate" value={analysisData.receptionDate} isEditing={isEditing} onChange={handleDataChange} />
                        <InfoItem label="분석일시" name="analysisDate" value={analysisData.analysisDate} isEditing={isEditing} onChange={handleDataChange} />
                        <InfoItem label="분석자" name="analyst" value={analysisData.analyst} isEditing={isEditing} onChange={handleDataChange} />
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    <input
                        type="checkbox"
                        id="reportCheck"
                        checked={showReportSection}
                        onChange={(e) => setShowReportSection(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="reportCheck" className="font-medium text-gray-700">(예비)결과서 레포트 발급</label>
                </div>

                {showReportSection && (
                    <div ref={reportRef} className="p-6 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                        <SectionTitle>(예비)결과서 레포트</SectionTitle>
                        <div className="text-center mb-4">
                            <h3 className="text-lg font-bold">분석 결과 미리보기</h3>
                            <p>시료 ID: {analysisData.sampleId}</p>
                            <p>품목명: {analysisData.itemName}</p>
                            <p>결과: 적합</p>
                        </div>
                        <div className="flex justify-center space-x-4 mt-4">
                            <button onClick={generatePdf} className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">PDF로 미리보기</button>
                            <button onClick={printReport} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">출력하기</button>
                        </div>
                    </div>
                )}

                <DataUploadSection />

                <div className="mt-6">
                    <SectionTitle>결과 통보</SectionTitle>
                    <div className="flex items-center space-x-4 p-4 border rounded-md">
                        <span>결과통보 연월일시: 2025-10-08 14:00</span>
                        <button className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600">전자결재</button>
                        <span className="font-bold text-green-700">결과통보완료</span>
                    </div>
                </div>

                <EditReasonSection isEditing={isEditing} editReason={editReason} setEditReason={setEditReason} editHistory={editHistory} />

                <div className="flex justify-center space-x-4 mt-8">
                    <button onClick={handleSave} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 w-48">
                        {isEditing ? '저장' : '수정'}
                    </button>
                </div>

                <div className="mt-10 border-t-2 pt-6 text-center">
                     <SectionTitle>최종 검토</SectionTitle>
                     <button className="px-6 py-3 bg-teal-500 text-white font-bold rounded-lg hover:bg-teal-600">
                        기술책임자 검토 요청
                    </button>
                </div>
            </div>
        </div>
    );
}