import { api } from './api';
import { useCallback, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Camera, Check, CircleHelp, LoaderCircle, ScanLine, Upload } from 'lucide-react';
import jsQR from 'jsqr';
import { getOpenCV, detectWorksheetBubbles } from './worksheetScanEngine';
import './worksheet.css';

type QRPayload = { v: number; worksheetId: string; classId: string; group: string | null };
type Question = { id: string; conceptId: string; conceptName: string; conceptNameTe: string; text: { en: string; te?: string }; options: Array<{ index: number; text: { en: string; te?: string } }>; correctIndex: number };
type Worksheet = { id: string; classId: string; className: string; classCode: string; classLevel: number; board: string; group: string | null; language: string; qrPayload: string };
const label = (language: string, en: string, te: string) => language === 'te' ? te : en;
const local = (text: { en: string; te?: string }, language: string) => language === 'te' ? text.te ?? text.en : text.en;

export default function WorksheetScanner({ classId, csrf, language, onBack }: { classId: string; csrf: string; language: string; onBack: () => void }) {
  const [imageUrl, setImageUrl] = useState('');
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [detected, setDetected] = useState<Array<number | null>>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [students, setStudents] = useState<Array<{ id: string; name: string; rollNo: string }>>([]);
  const [studentId, setStudentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Array<{ correct: boolean; mastery: number }> | null>(null);
  const [error, setError] = useState('');

  const scanFile = useCallback(async (file: File) => {
    setBusy(true); setError(''); setSaved(null); setWorksheet(null); setAnswers({}); setQuestions([]);
    try {
      const image = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1800 / image.width);
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d'); if (!context) throw new Error('This browser cannot read the uploaded image.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
      setImageUrl(canvas.toDataURL('image/jpeg', 0.78));
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
      if (!qr) throw new Error(label(language, 'Could not read a worksheet QR code. Retake the photo with the full code in view.', 'వర్క్‌షీట్ QR కోడ్‌ను చదవలేకపోయాం. కోడ్ మొత్తం కనిపించేలా మళ్లీ ఫోటో తీయండి.'));
      const payload = JSON.parse(qr.data) as QRPayload;
      if (payload.v !== 1 || !payload.worksheetId || payload.classId !== classId) throw new Error(label(language, 'This QR code does not belong to the selected class.', 'ఈ QR కోడ్ ఎంచుకున్న తరగతికి చెందలేదు.'));
      const response = await api(`/teacher/worksheets/${encodeURIComponent(payload.worksheetId)}`);
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Could not load this worksheet.');
      const cv = await getOpenCV();
      const marks = detectWorksheetBubbles(cv, canvas, qr.location, data.questions.length);
      setWorksheet(data.worksheet); setQuestions(data.questions); setDetected(marks);
      setAnswers(Object.fromEntries(data.questions.flatMap((question: Question, index: number) => marks[index] === null ? [] : [[question.id, marks[index]!]])));
      const classResponse = await api(`/teacher/dashboard?classId=${encodeURIComponent(classId)}`);
      const classData = await classResponse.json(); if (!classResponse.ok) throw new Error(classData.error?.message ?? 'Could not load the class roster.');
      setStudents(classData.students.map((student: { id: string; name: string; rollNo: string }) => ({ id: student.id, name: student.name, rollNo: student.rollNo })));
    } catch (e) { setError(e instanceof Error ? e.message : label(language, 'Could not scan this worksheet.', 'ఈ వర్క్‌షీట్‌ను స్కాన్ చేయలేకపోయాం.')); }
    finally { setBusy(false); }
  }, [classId, language]);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void scanFile(file); event.target.value = ''; };
  const saveReviewed = async () => {
    if (!worksheet || !studentId || questions.some((question) => answers[question.id] === undefined)) { setError(label(language, 'Choose a student and review a bubble for every question.', 'విద్యార్థిని ఎంచుకుని ప్రతి ప్రశ్నకు బబుల్‌ను తనిఖీ చేయండి.')); return; }
    setBusy(true); setError('');
    try {
      const response = await api(`/teacher/worksheets/${worksheet.id}/reviewed-answers`, { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify({ studentId, answers: questions.map((question) => ({ clientId: crypto.randomUUID(), questionId: question.id, selectedOption: answers[question.id]! })) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Could not save the reviewed answers.'); setSaved(data.saved);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the reviewed answers.'); }
    finally { setBusy(false); }
  };

  return <section className="worksheet-scanner">
    <button className="back-button" onClick={onBack}><ArrowLeft size={16}/>{label(language, 'Back to class', 'తరగతికి తిరిగి')}</button>
    <div className="worksheet-heading"><span className="worksheet-icon"><ScanLine size={20}/></span><div><p className="teacher-kicker">{label(language, 'WORKSHEET SCANNER', 'వర్క్‌షీట్ స్కానర్')}</p><h2>{label(language, 'Scan and review answers', 'సమాధానాలను స్కాన్ చేసి సమీక్షించండి')}</h2><p>{label(language, 'Upload a clear photo. You will review every detected bubble before saving.', 'స్పష్టమైన ఫోటోను అప్‌లోడ్ చేయండి. భద్రపరచే ముందు ప్రతి గుర్తించిన బబుల్‌ను సమీక్షించవచ్చు.')}</p></div></div>
    <p className="worksheet-scan-tip">{label(language, 'Photograph the question page with the full QR code visible. Keep the page as flat as possible.', 'ప్రశ్నల పేజీని పూర్తి QR కోడ్‌తో ఫోటో తీయండి. పేజీని వీలైనంత సమతలంగా ఉంచండి.')}</p><label className="worksheet-upload"><input type="file" accept="image/*" capture="environment" onChange={chooseFile}/>{busy ? <LoaderCircle className="spin"/> : <Camera size={20}/>}<span>{busy ? label(language, 'Reading worksheet…', 'వర్క్‌షీట్ చదువుతున్నాం…') : label(language, 'Take a photo or choose an image', 'ఫోటో తీయండి లేదా చిత్రాన్ని ఎంచుకోండి')}</span><Upload size={16}/></label>
    {error && <p className="teacher-error" role="alert">{error}</p>}
    {worksheet && <div className="scan-review"><div className="scan-preview-card"><img src={imageUrl} alt={label(language, 'Uploaded worksheet photo', 'అప్‌లోడ్ చేసిన వర్క్‌షీట్ ఫోటో')}/><div><b><Check size={14}/>{label(language, 'QR verified', 'QR ధృవీకరించబడింది')}</b><span>{worksheet.className} · {worksheet.classCode}</span><small>{worksheet.group ?? label(language, 'Whole class', 'మొత్తం తరగతి')} · {detected.filter((item) => item !== null).length}/{questions.length} {label(language, 'bubbles detected', 'బబుల్స్ గుర్తించబడ్డాయి')}</small></div></div>
      {!saved ? <>
        <div className="scan-student"><label>{label(language, 'Student who completed this sheet', 'ఈ పత్రాన్ని పూర్తి చేసిన విద్యార్థి')}<select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">{label(language, 'Choose a student', 'విద్యార్థిని ఎంచుకోండి')}</option>{students.map((student) => <option key={student.id} value={student.id}>{student.rollNo} · {student.name}</option>)}</select></label><p><CircleHelp size={15}/>{label(language, 'OpenCV detected filled bubbles. Change any selection that needs correction.', 'నింపిన బబుల్స్‌ను OpenCV గుర్తించింది. అవసరమైతే ఎంపికను మార్చండి.')}</p></div>
        <div className="scan-question-list">{questions.map((question, index) => <article key={question.id} className="scan-question"><div className="scan-question-text"><span>{index + 1}</span><div><b>{language === 'te' ? question.conceptNameTe || question.conceptName : question.conceptName}</b><p>{local(question.text, language)}</p></div><em className={detected[index] === null ? 'unread' : 'read'}>{detected[index] === null ? label(language, 'Review mark', 'గుర్తును తనిఖీ చేయండి') : label(language, `Detected ${String.fromCharCode(65 + detected[index]!)}`, `${String.fromCharCode(65 + detected[index]!)} గుర్తించబడింది`)}</em></div><div className="scan-options">{question.options.map((option) => <label key={option.index} className={answers[question.id] === option.index ? 'chosen' : ''}><input type="radio" name={question.id} checked={answers[question.id] === option.index} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.index }))}/><span>{String.fromCharCode(65 + option.index)}</span><small>{local(option.text, language)}</small></label>)}</div></article>)}</div>
        <button className="primary" disabled={busy || !studentId} onClick={() => void saveReviewed()}>{busy ? <><LoaderCircle className="spin" size={16}/>{label(language, 'Saving reviewed answers…', 'సమీక్షించిన సమాధానాలను భద్రపరుస్తున్నాం…')}</> : label(language, 'Save reviewed answers', 'సమీక్షించిన సమాధానాలను భద్రపరచండి')}</button>
      </> : <div className="scan-saved"><Check size={20}/><div><b>{label(language, 'Answers saved to the student’s learning history.', 'విద్యార్థి అభ్యాస చరిత్రలో సమాధానాలు భద్రపరచబడ్డాయి.')}</b><span>{saved.filter((item) => item.correct).length} / {saved.length} {label(language, 'correct · mastery updated by the learning engine', 'సరైనవి · అభ్యాస ఇంజిన్ పట్టు స్థాయిని నవీకరించింది')}</span></div></div>}</div>}
  </section>;
}



