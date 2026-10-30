import { api } from './api';
import { useEffect, useState } from 'react';
import { PDFDownloadLink, Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import teluguRegular from '@fontsource/noto-sans-telugu/files/noto-sans-telugu-telugu-400-normal.woff?url';
import teluguBold from '@fontsource/noto-sans-telugu/files/noto-sans-telugu-telugu-700-normal.woff?url';
import { ArrowLeft, Download, LoaderCircle, Printer, ScanLine } from 'lucide-react';
import './worksheet.css';

type Concept = { id: string; slug: string; name: string; nameTe?: string; classLevel: number; chapter: string };
type Classroom = { id: string; name: string; code: string; classLevel: number; board: string };
type WorksheetData = { id: string; classId: string; className: string; classCode: string; classLevel: number; board: string; group: string | null; language: string; qrPayload: string };
type WorksheetQuestion = { id: string; conceptId: string; conceptName: string; conceptNameTe: string; difficulty: number; text: { en: string; te?: string }; options: Array<{ index: number; text: { en: string; te?: string } }>; correctIndex: number; answer: { en: string; te?: string } };
const copy = (language: string, en: string, te: string) => language === 'te' ? te : en;
const value = (data: { en: string; te?: string }, language: string) => language === 'te' ? data.te ?? data.en : data.en;
Font.register({ family: 'Noto Sans Telugu', fonts: [{ src: teluguRegular, fontWeight: 400 }, { src: teluguBold, fontWeight: 700 }] });

export default function WorksheetStudio({ classId, classroom, concepts, csrf, language, onBack }: { classId: string; classroom: Classroom; concepts: Concept[]; csrf: string; language: string; onBack: () => void }) {
  const [selected, setSelected] = useState<string[]>(concepts.slice(0, 1).map((item) => item.slug));
  const [group, setGroup] = useState('');
  const [sheet, setSheet] = useState<WorksheetData | null>(null);
  const [questions, setQuestions] = useState<WorksheetQuestion[]>([]);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (sheet) void QRCode.toDataURL(sheet.qrPayload, { width: 256, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#18241d', light: '#ffffff' } }).then(setQr).catch(() => setError(copy(language, 'Could not create the worksheet QR code.', 'వర్క్‌షీట్ QR కోడ్‌ను సృష్టించలేకపోయాం.'))); }, [sheet, language]);
  const toggle = (slug: string) => setSelected((current) => current.includes(slug) ? current.filter((item) => item !== slug) : current.length < 2 ? [...current, slug] : current);
  const create = async () => {
    setBusy(true); setError(''); setSheet(null);
    try {
      const response = await api('/teacher/worksheets', { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: JSON.stringify({ classId, conceptIds: selected, ...(group ? { group } : {}), language }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? 'Could not create this worksheet.'); setSheet(data.worksheet); setQuestions(data.questions);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create this worksheet.'); }
    finally { setBusy(false); }
  };
  return <section className="worksheet-builder">
    <button className="back-button" onClick={onBack}><ArrowLeft size={16}/>{copy(language, 'Back to class', 'తరగతికి తిరిగి')}</button>
    <div className="worksheet-heading"><span className="worksheet-icon"><Printer size={20}/></span><div><p className="teacher-kicker">{copy(language, 'PRINTABLE PRACTICE', 'ముద్రించదగిన సాధన')}</p><h2>{copy(language, 'Create a worksheet', 'వర్క్‌షీట్ సృష్టించండి')}</h2><p>{classroom.name} · {classroom.board === 'TELANGANA_SCERT' ? 'Telangana SCERT' : classroom.board} · {copy(language, 'Class', 'తరగతి')} {classroom.classLevel}</p></div></div>
    <div className="worksheet-config"><div><h3>{copy(language, 'Choose up to two concepts', 'రెండు భావనల వరకు ఎంచుకోండి')}</h3><p>{copy(language, 'Three questions per concept, with bubble-style answer boxes.', 'ప్రతి భావనకు మూడు ప్రశ్నలు, బబుల్ సమాధాన పెట్టెలతో.')}</p><div className="worksheet-concepts">{concepts.map((concept) => <label key={concept.slug}><input type="checkbox" checked={selected.includes(concept.slug)} onChange={() => toggle(concept.slug)} disabled={!selected.includes(concept.slug) && selected.length >= 2}/><span>{language === 'te' ? concept.nameTe ?? concept.name : concept.name}</span><small>C{concept.classLevel}</small></label>)}</div></div><div className="worksheet-options"><label>{copy(language, 'Target group (optional)', 'లక్ష్య సమూహం (ఐచ్ఛికం)')}<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">{copy(language, 'Whole class', 'మొత్తం తరగతి')}</option><option value="ready-to-advance">{copy(language, 'Ready to advance', 'ముందుకు సిద్ధం')}</option><option value="on-track">{copy(language, 'On track', 'సరైన దారిలో')}</option><option value="needs-basics">{copy(language, 'Needs basics', 'ప్రాథమికాలు అవసరం')}</option></select></label><label>{copy(language, 'Worksheet language', 'వర్క్‌షీట్ భాష')}<select value={language} disabled><option value="en">English</option><option value="te">తెలుగు</option></select></label><button className="primary" onClick={() => void create()} disabled={busy || !selected.length}>{busy ? <><LoaderCircle className="spin" size={16}/>{copy(language, 'Preparing…', 'సిద్ధం చేస్తున్నాం…')}</> : <><Printer size={16}/>{copy(language, 'Prepare worksheet', 'వర్క్‌షీట్ సిద్ధం చేయండి')}</>}</button>{error && <p className="teacher-error" role="alert">{error}</p>}</div></div>
    {sheet && qr && <div className="worksheet-ready"><div><span className="approved-pill"><ScanLine size={14}/>{copy(language, 'Ready to print and scan', 'ముద్రించి స్కాన్ చేయడానికి సిద్ధం')}</span><h3>{sheet.className} · {sheet.classCode}</h3><p>{questions.length} {copy(language, 'questions · answer key included', 'ప్రశ్నలు · సమాధాన పట్టికతో')}</p><PDFDownloadLink className="primary worksheet-download" document={<WorksheetPDF worksheet={sheet} questions={questions} qr={qr}/>} fileName={`conceptbridge-${sheet.classCode}-${sheet.id.slice(-6)}.pdf`}>{({ loading: pdfLoading }) => pdfLoading ? <><LoaderCircle className="spin" size={16}/>{copy(language, 'Building PDF…', 'PDF సిద్ధం చేస్తున్నాం…')}</> : <><Download size={16}/>{copy(language, 'Download printable PDF', 'ముద్రణ PDF డౌన్‌లోడ్ చేయండి')}</>}</PDFDownloadLink></div><img className="worksheet-qr-preview" src={qr} alt={copy(language, 'QR code for this worksheet', 'ఈ వర్క్‌షీట్ QR కోడ్')}/></div>}
  </section>;
}

const styles = StyleSheet.create({ page: { paddingTop: 30, paddingHorizontal: 42, paddingBottom: 28, fontFamily: 'Helvetica', color: '#18241d', fontSize: 10 }, header: { height: 88, borderBottom: '1 solid #d6dfd8', marginBottom: 9, paddingTop: 2 }, brand: { fontSize: 9, color: '#397a59', fontWeight: 700, letterSpacing: 1.2 }, title: { fontSize: 19, marginTop: 7, fontWeight: 700 }, sub: { fontSize: 8, color: '#526258', marginTop: 5 }, qr: { width: 68, height: 68, position: 'absolute', top: 0, right: 0 }, sheetMeta: { width: 390 }, question: { height: 105, borderBottom: '1 solid #e1e7e2', paddingTop: 7, position: 'relative' }, qtitle: { fontSize: 8, color: '#397a59', fontWeight: 700, marginBottom: 5 }, qtext: { fontSize: 11, lineHeight: 1.35, maxHeight: 38 }, options: { position: 'absolute', left: 0, bottom: 9, flexDirection: 'row', gap: 21 }, option: { width: 145, flexDirection: 'row', alignItems: 'center', fontSize: 8 }, bubble: { width: 14, height: 14, border: '1.2 solid #27382e', borderRadius: 7, marginRight: 5 }, optionText: { width: 126 }, footer: { position: 'absolute', left: 42, right: 42, bottom: 14, borderTop: '1 solid #d6dfd8', paddingTop: 5, color: '#718078', fontSize: 7 }, keyTitle: { fontSize: 18, fontWeight: 700, marginBottom: 7 }, keyIntro: { color: '#5b6a60', fontSize: 9, marginBottom: 15 }, answerRow: { minHeight: 54, borderBottom: '1 solid #e2e8e3', paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between' }, keyConcept: { color: '#526258', fontSize: 8, marginBottom: 4 }, answer: { fontSize: 11, fontWeight: 700, color: '#397a59' }, nameLine: { borderBottom: '1 solid #809087', width: 190, marginTop: 13 }, small: { fontSize: 8, color: '#64736a', marginTop: 6 } });

function WorksheetPDF({ worksheet, questions, qr }: { worksheet: WorksheetData; questions: WorksheetQuestion[]; qr: string }) {
  const te = worksheet.language === 'te';
  return <Document title={`ConceptBridge worksheet ${worksheet.classCode}`} author="ConceptBridge">
    <Page size="A4" style={[styles.page, { fontFamily: te ? 'Noto Sans Telugu' : 'Helvetica' }]} wrap={false}>
      <View style={styles.header}><View style={styles.sheetMeta}><Text style={styles.brand}>CONCEPTBRIDGE · {worksheet.board === 'TELANGANA_SCERT' ? 'TELANGANA SCERT' : 'CBSE'}</Text><Text style={styles.title}>{te ? 'గణిత సాధన పత్రం' : 'Maths practice worksheet'}</Text><Text style={styles.sub}>{worksheet.className} · {te ? 'తరగతి' : 'Class'} {worksheet.classLevel} · {worksheet.classCode}{worksheet.group ? ` · ${worksheet.group}` : ''}</Text><Text style={styles.sub}>{te ? 'విద్యార్థి పేరు' : 'Student name'}: _________________________</Text></View><Image style={styles.qr} src={qr}/></View>
      {questions.map((question, index) => <View key={question.id} style={styles.question} wrap={false}><Text style={styles.qtitle}>{index + 1}. {te ? question.conceptNameTe || question.conceptName : question.conceptName}</Text><Text style={styles.qtext}>{value(question.text, worksheet.language)}</Text><View style={styles.options}>{question.options.map((option, optionIndex) => <View key={option.index} style={styles.option}><View style={styles.bubble}/><Text style={styles.optionText}>{String.fromCharCode(65 + optionIndex)}. {value(option.text, worksheet.language)}</Text></View>)}</View></View>)}
      <Text style={styles.footer}>{te ? 'ప్రతి ప్రశ్నకు ఒక బబుల్‌ను నింపండి. మీ ఉత్తమంగా ప్రయత్నించండి.' : 'Fill one bubble for each question. Do your best.'} · {worksheet.id.slice(-8).toUpperCase()}</Text>
    </Page>
    <Page size="A4" style={[styles.page, { fontFamily: te ? 'Noto Sans Telugu' : 'Helvetica' }]}>
      <Text style={styles.brand}>CONCEPTBRIDGE</Text><Text style={styles.keyTitle}>{te ? 'ఉపాధ్యాయుని సమాధాన పట్టిక' : 'Teacher answer key'}</Text><Text style={styles.keyIntro}>{worksheet.className} · {te ? 'తరగతి' : 'Class'} {worksheet.classLevel} · {worksheet.classCode}</Text>
      {questions.map((question, index) => <View key={question.id} style={styles.answerRow}><View><Text style={styles.keyConcept}>{index + 1}. {te ? question.conceptNameTe || question.conceptName : question.conceptName}</Text><Text>{value(question.text, worksheet.language)}</Text></View><Text style={styles.answer}>{String.fromCharCode(65 + question.correctIndex)} · {value(question.answer, worksheet.language)}</Text></View>)}
      <Text style={styles.small}>{te ? 'సమాధాన పత్రాన్ని విద్యార్థులతో పంచుకోకండి.' : 'Keep this answer page for teacher review.'}</Text><Text style={styles.footer}>{worksheet.id.toUpperCase()}</Text>
    </Page>
  </Document>;
}




