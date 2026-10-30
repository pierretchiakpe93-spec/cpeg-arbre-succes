// Grille de saisie inspirée des fiches de notes papier de l'établissement.
const CPEG_NOTE_EVALUATIONS = [
  '1er inter', '2ème inter', '3ème inter', '4ème inter', '5ème inter',
  '1er devoir', '2ème devoir'
];
const CPEG_EXAM_EVALUATIONS = ['Examen blanc 1', 'Examen blanc 2', 'Examen blanc 3', 'Examen blanc 4'];
const CPEG_ALL_NOTE_EVALUATIONS = [...CPEG_NOTE_EVALUATIONS, ...CPEG_EXAM_EVALUATIONS];
const CPEG_NOTE_SUBJECTS = [
  ['ANGLAIS', 'Anglais'],
  ['ALLEMAND', 'Allemand'],
  ['ECONOMIE', 'Économie'],
  ['EMC', 'Éducation civique et morale'],
  ['EPS', 'EPS / Sport'],
  ['FRANCAIS COM. ECRITE', 'Français - Communication écrite'],
  ['FRANCAIS LECTURE', 'Français - Lecture'],
  ['HIST-GEO', 'Histoire-Géographie'],
  ['INFORMATIQUE', 'Informatique'],
  ['MATHS GENE', 'Mathématiques générales'],
  ['PHILOSOPHIE', 'Philosophie'],
  ['PCT', 'PCT'],
  ['ESPAGNOL', 'Espagnol'],
  ['SVT', 'SVT'],
  ['Conduite', 'Conduite']
];
let cpegNotesClass = '';
let cpegNotesSubject = 'ANGLAIS';
let cpegNotesTerm = '1er trimestre';
let cpegNotesClasses = [];

function cpegNotesKey(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function cpegIsExamClass(className = '') {
  const normalized = cpegNotesKey(className).replace(/[._-]+/g, ' ');
  return /(?:^|\s)(?:3e|3eme|troisieme|tle|terminale)(?:\s|$)/.test(normalized);
}

function cpegNoteEvaluationsForClass(className = '') {
  return cpegIsExamClass(className) ? CPEG_ALL_NOTE_EVALUATIONS : CPEG_NOTE_EVALUATIONS;
}

function cpegSubjectsForClass(className) {
  const normalized = cpegNotesKey(className);
  if (/^6e(?:me)?(?:\s|$)/.test(normalized)) {
    return CPEG_NOTE_SUBJECTS.filter(([key]) => !['FRANCAIS LECTURE', 'Conduite'].includes(key));
  }
  return CPEG_NOTE_SUBJECTS;
}

function cpegGradeRecord(student, className, subject, term, evaluation) {
  const aliases = evaluation === '1er devoir' ? ['1er devoir', 'Devoir 1']
    : evaluation === '2ème devoir' ? ['2ème devoir', 'Devoir 2'] : [evaluation];
  return data.notes.find(note =>
    (note.__student_id ? note.__student_id === student.__id : cpegNotesKey(note.eleve) === cpegNotesKey(student.nom)) &&
    (note.classe || note.__class_name) === className && note.matiere === subject &&
    note.periode === term && aliases.includes(note.evaluation)
  );
}

async function notesEntryPage() {
  const host = document.getElementById('content');
  if (!host || !canRead('notes')) return;
  if (dbProfile?.role === 'enseignant') {
    const { data: rows, error } = await supabaseClient.from('teacher_classes')
      .select('class_name').eq('school_id', dbProfile.school_id).eq('user_id', dbUser.id);
    if (error) {
      host.innerHTML = `<div class="card"><h2>Notes</h2><p>Impossible de charger vos classes : ${esc(error.message)}</p></div>`;
      return;
    }
    cpegNotesClasses = [...new Set((rows || []).map(row => row.class_name).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  } else {
    cpegNotesClasses = [...new Set([
      ...data.classes.map(row => row.nom),
      ...data.eleves.map(row => row.classe || row.__class_name)
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  }

  if (!cpegNotesClasses.includes(cpegNotesClass)) cpegNotesClass = cpegNotesClasses[0] || '';
  const classStudents = data.eleves.filter(student =>
    (student.classe || student.__class_name) === cpegNotesClass
  ).sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' }));
  const subjectOptions = cpegSubjectsForClass(cpegNotesClass);
  const evaluations = cpegNoteEvaluationsForClass(cpegNotesClass);
  if (!subjectOptions.some(([key]) => key === cpegNotesSubject)) cpegNotesSubject = subjectOptions[0]?.[0] || '';
  const selectedSubject = subjectOptions.find(([key]) => key === cpegNotesSubject) || subjectOptions[0] || ['', ''];
  const teacherCanWrite = canWrite('notes');
  const canMakeBulletin = dbProfile?.role === 'admin';

  host.innerHTML = `
    <div class="page-head"><div><h1>Notes</h1><p>Saisie par classe, matière et trimestre, selon les fiches de notes de l’école.</p></div>
      ${canWrite('notes') ? `<button class="btn secondary" onclick="tablePage('notes')">Historique et import Excel</button>` : ''}</div>
    <div class="table-card notes-sheet-card">
      <div class="notes-sheet-controls">
        <label>Classe<select id="notesSheetClass" ${dbProfile?.role === 'enseignant' ? 'disabled' : ''}>
          ${cpegNotesClasses.map(name => `<option value="${esc(name)}" ${name === cpegNotesClass ? 'selected' : ''}>${esc(name)}</option>`).join('')}
        </select></label>
        <label>Matière<select id="notesSheetSubject">
          ${subjectOptions.map(([key, label]) => `<option value="${esc(key)}" ${key === cpegNotesSubject ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select></label>
        <label>Trimestre<select id="notesSheetTerm">
          ${['1er trimestre', '2e trimestre', '3e trimestre'].map(term => `<option value="${term}" ${term === cpegNotesTerm ? 'selected' : ''}>${term}</option>`).join('')}
        </select></label>
        ${canMakeBulletin ? `<button class="btn secondary" type="button" onclick="notesBulletinPage()">Préparer les bulletins</button>` : ''}
      </div>
      <p class="notes-sheet-help">Saisissez les notes sur 20. Les cases vides restent sans note. Les élèves affichés sont ceux de la classe sélectionnée.</p>
      ${cpegIsExamClass(cpegNotesClass) ? '<p class="notes-sheet-help">Classe d’examen : les quatre examens blancs sont disponibles après les devoirs.</p>' : ''}
      ${classStudents.length ? `<div class="table-wrap notes-sheet-wrap"><table class="notes-sheet-table"><thead><tr><th>N°</th><th>Nom et prénom(s) de l’élève</th>${evaluations.map(label => `<th>${label}</th>`).join('')}</tr></thead>
        <tbody>${classStudents.map((student, index) => `<tr><td>${index + 1}</td><td>${esc(student.nom || '')}</td>${evaluations.map(evaluation => {
          const record = cpegGradeRecord(student, cpegNotesClass, selectedSubject[0], cpegNotesTerm, evaluation);
          return `<td><input class="notes-grade-input" type="text" inputmode="decimal" aria-label="${esc(evaluation)} - ${esc(student.nom || '')}" data-student-id="${esc(student.__id || '')}" data-student-name="${esc(student.nom || '')}" data-evaluation="${esc(evaluation)}" value="${esc(record?.note ?? '')}" ${teacherCanWrite ? '' : 'disabled'}></td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>` : `<div class="empty notes-sheet-empty">${cpegNotesClass ? 'Aucun élève enregistré dans cette classe.' : 'Aucune classe accessible. Demandez à l’administration de vous attribuer une classe.'}</div>`}
      <div class="notes-sheet-footer"><span>${classStudents.length} élève(s) · ${esc(selectedSubject[1])} · ${esc(cpegNotesTerm)}</span>
        ${teacherCanWrite && classStudents.length ? `<button class="btn primary" type="button" onclick="saveNotesSheet()">Enregistrer les notes</button>` : ''}</div>
    </div>`;

  document.getElementById('notesSheetClass')?.addEventListener('change', event => {
    cpegNotesClass = event.target.value;
    notesEntryPage();
  });
  document.getElementById('notesSheetSubject')?.addEventListener('change', event => {
    cpegNotesSubject = event.target.value;
    notesEntryPage();
  });
  document.getElementById('notesSheetTerm')?.addEventListener('change', event => {
    cpegNotesTerm = event.target.value;
    notesEntryPage();
  });
}

function notesBulletinPage() {
  if (dbProfile?.role !== 'admin') return;
  const host = document.getElementById('content');
  const classes = [...new Set([...data.classes.map(row => row.nom), ...data.eleves.map(row => row.classe || row.__class_name)].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  if (!classes.includes(cpegNotesClass)) cpegNotesClass = classes[0] || '';
  const subjectOptions = cpegSubjectsForClass(cpegNotesClass);
  host.innerHTML = `
    <div class="page-head"><div><h1>Bulletins trimestriels</h1><p>Préparez un bulletin imprimable pour chaque élève de la classe.</p></div><button class="btn secondary" onclick="notesEntryPage()">Retour aux notes</button></div>
    <div class="table-card" style="padding:18px">
      <div class="notes-sheet-controls" style="padding:0">
        <label>Classe<select id="bulletinClass">${classes.map(name => `<option value="${esc(name)}" ${name === cpegNotesClass ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
        <label>Trimestre<select id="bulletinTerm">${['1er trimestre', '2e trimestre', '3e trimestre'].map(term => `<option value="${term}" ${term === cpegNotesTerm ? 'selected' : ''}>${term}</option>`).join('')}</select></label>
      </div>
      <p class="notes-sheet-help" style="margin-left:0">Moyenne par matière = (moyenne des interrogations + 1er devoir + 2e devoir) ÷ 3. La moyenne des interrogations est calculée avec les notes saisies. Une moyenne de matière reste vide tant qu’il manque une interrogation ou l’un des deux devoirs.</p>
      <button class="btn primary" type="button" onclick="printNotesBulletins()">Générer les bulletins imprimables</button>
    </div>`;
  document.getElementById('bulletinClass')?.addEventListener('change', event => {
    cpegNotesClass = event.target.value;
    notesBulletinPage();
  });
  document.getElementById('bulletinTerm')?.addEventListener('change', event => {
    cpegNotesTerm = event.target.value;
  });
}

function printNotesBulletins() {
  if (dbProfile?.role !== 'admin') return;
  const className = document.getElementById('bulletinClass')?.value || '';
  const term = document.getElementById('bulletinTerm')?.value || '1er trimestre';
  const students = data.eleves.filter(student => (student.classe || student.__class_name) === className)
    .sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' }));
  if (!students.length) { notify('Aucun élève n’est enregistré dans cette classe.'); return; }
  const subjectOptions = cpegSubjectsForClass(className);
  const getScores = (student, subject) => CPEG_NOTE_EVALUATIONS.map(evaluation => {
    const note = cpegGradeRecord(student, className, subject, term, evaluation);
    if (!note || String(note.note ?? '').trim() === '') return null;
    const score = Number(String(note.note).replace(',', '.'));
    return Number.isFinite(score) ? score : null;
  });
  const mean = values => { const present = values.filter(value => value !== null); return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null; };
  const appreciation = value => value === null ? 'Notes à compléter.'
    : value >= 16 ? 'Excellent travail, élève sérieux et appliqué.'
    : value >= 14 ? 'Très bon travail. Continue ainsi.'
    : value >= 12 ? 'Bon travail, des efforts réguliers à poursuivre.'
    : value >= 10 ? 'Ensemble satisfaisant, peut encore progresser.'
    : value >= 8 ? 'Résultats fragiles. Davantage de travail est nécessaire.'
    : 'Résultats insuffisants. Des efforts soutenus sont attendus.';
  const generalAppreciation = value => value === null ? 'Les notes sont encore insuffisantes pour établir une appréciation.'
    : value >= 16 ? 'Excellent trimestre. Félicitations pour ce travail remarquable.'
    : value >= 14 ? 'Très bon trimestre. L’élève doit poursuivre ses efforts.'
    : value >= 12 ? 'Bon trimestre dans l’ensemble. Encouragements à continuer.'
    : value >= 10 ? 'Trimestre passable. Un travail plus régulier permettra de progresser.'
    : 'Trimestre difficile. Un accompagnement et des efforts réguliers sont nécessaires.';
  const summaries = students.map(student => {
    const subjects = subjectOptions.map(([key, label]) => {
      const scores = getScores(student, key), interros = mean(scores.slice(0, 5));
      const average = interros === null || scores[5] === null || scores[6] === null ? null : (interros + scores[5] + scores[6]) / 3;
      return { key, label, scores, interros, average };
    });
    return { student, subjects, overall: mean(subjects.map(subject => subject.average).filter(value => value !== null)) };
  });
  const sorted = summaries.filter(row => row.overall !== null).slice().sort((a, b) => b.overall - a.overall);
  const rank = new Map();
  sorted.forEach((row, index) => { const previous = sorted[index - 1]; rank.set(row.student.__id, previous && Math.abs(previous.overall - row.overall) < 0.0001 ? rank.get(previous.student.__id) : index + 1); });
  if (!summaries.some(row => row.overall !== null)) { notify('Aucune note n’a été enregistrée pour cette classe et ce trimestre.'); return; }
  const popup = window.open('', '_blank');
  if (!popup) { notify('Autorisez les fenêtres contextuelles pour générer les bulletins.'); return; }
  const format = value => value === null ? '—' : value.toFixed(1).replace('.', ',');
  const examClass = cpegIsExamClass(className);
  const pages = summaries.map(({ student, subjects, overall }) => {
    const ordinal = students.findIndex(row => row.__id === student.__id) + 1;
    const groupedSubjects = [
      { title: 'TRONC COMMUN', items: subjects.filter(subject => !['ESPAGNOL', 'ALLEMAND', 'INFORMATIQUE', 'EPS', 'EMC', 'Conduite'].includes(subject.key)) },
      { title: 'ENSEIGNEMENTS OPTIONNELS', items: subjects.filter(subject => ['ESPAGNOL', 'ALLEMAND', 'INFORMATIQUE', 'EPS'].includes(subject.key)) },
      { title: 'ÉDUCATION CIVIQUE ET MORALE', items: subjects.filter(subject => ['EMC', 'Conduite'].includes(subject.key)) }
    ].filter(group => group.items.length);
    const exams = examClass ? subjectOptions.filter(([key]) => key !== 'Conduite').map(([key, label]) => {
      const scores = CPEG_EXAM_EVALUATIONS.map(evaluation => {
        const record = cpegGradeRecord(student, className, key, term, evaluation);
        if (!record || String(record.note ?? '').trim() === '') return null;
        const value = Number(String(record.note).replace(',', '.'));
        return Number.isFinite(value) ? value : null;
      });
      return { label, scores };
    }) : [];
    const parts = String(student.nom || '').trim().split(/\s+/);
    const surname = student.nom_famille || parts[0] || '';
    const first = student.prenoms || student.prénom || student.first_name || parts.slice(1).join(' ');
    return `<article class="bulletin">
      <header class="school-head"><div class="seal">CS<br><b>🌳</b><br>SUCCÈS</div><div class="school-name"><div>COLLÈGE PRIVÉ D’ENSEIGNEMENT GÉNÉRAL</div><h1>CS L’ARBRE DE SUCCÈS</h1><p>Discipline · Travail · Succès</p></div><div class="motto">Le savoir<br>est la clé<br>de la réussite !</div></header>
      <div class="title-band"><b>BULLETIN SCOLAIRE</b><span>${esc(term)} — Année scolaire ${esc(currentYear())}</span></div>
      <section class="identity"><div class="photo">PHOTO<br>DE L’ÉLÈVE</div><div class="identity-lines"><div><b>Nom :</b> ${esc(surname)}</div><div><b>Prénom(s) :</b> ${esc(first)}</div><div><b>Date de naissance :</b> ${esc(student.date_naissance || '________________')}</div><div><b>Classe :</b> ${esc(className)}　 <b>N° d’ordre :</b> ${ordinal} / ${students.length}</div><div><b>Année scolaire :</b> ${esc(currentYear())}</div></div></section>
      <table class="grades"><thead><tr><th>N°</th><th>DISCIPLINES</th><th>Moy. interros</th><th>Devoir 1</th><th>Devoir 2</th><th>Moyenne /20</th><th>Appréciations des professeurs</th><th>Signature</th></tr></thead><tbody>
      ${groupedSubjects.map(group => `<tr class="group"><th colspan="8">${esc(group.title)}</th></tr>${group.items.map(subject => `<tr><td>${subjects.indexOf(subject) + 1}</td><th>${esc(subject.label)}</th><td>${format(subject.interros)}</td><td>${format(subject.scores[5])}</td><td>${format(subject.scores[6])}</td><td><b>${format(subject.average)}</b></td><td class="comment">${esc(appreciation(subject.average))}</td><td></td></tr>`).join('')}`).join('')}
      </tbody></table>
      <section class="summary"><div class="summary-left"><h3>RÉCAPITULATIF GÉNÉRAL</h3><div><b>Moyenne générale</b><strong>${format(overall)} / 20</strong></div><div><b>Rang de la classe</b><strong>${rank.has(student.__id) ? rank.get(student.__id) : '—'} / ${students.length}</strong></div><div><b>Appréciation générale</b><strong>${esc(overall === null ? '—' : overall >= 16 ? 'Excellent' : overall >= 14 ? 'Très bien' : overall >= 12 ? 'Bien' : overall >= 10 ? 'Passable' : 'Insuffisant')}</strong></div><div><b>Calcul</b><span>(${esc('moyenne des interrogations')} + devoir 1 + devoir 2) ÷ 3</span></div></div><div class="council"><h3>APPRÉCIATION DU CONSEIL DE CLASSE</h3><p>${esc(generalAppreciation(overall))}</p><b>${overall !== null && overall >= 14 ? '✦ Félicitations ! Continue ainsi !' : overall !== null && overall >= 12 ? '✦ Encouragements' : '✦ Poursuivre les efforts'}</b></div></section>
      ${examClass ? `<section class="exam-section"><h3>EXAMENS BLANCS — RÉSULTATS</h3><table><thead><tr><th>Discipline</th>${CPEG_EXAM_EVALUATIONS.map(label => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${exams.map(subject => `<tr><th>${esc(subject.label)}</th>${subject.scores.map(score => `<td>${format(score)}</td>`).join('')}</tr>`).join('')}</tbody></table><small>Les examens blancs ne sont pas inclus dans la moyenne trimestrielle.</small></section>` : ''}
      <div class="signatures"><span>Le Professeur Principal<br><br>________________________</span><span>Le Directeur d’Établissement<br><br>________________________</span><span>Cachet de l’établissement<br><br>________________</span></div>
      <footer>Ensemble pour la réussite de chaque élève ! · ${esc(term)} · ${esc(className)}</footer>
    </article>`;
  }).join('');
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bulletins - ${esc(className)} - ${esc(term)}</title><style>
    @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font:8px Arial,sans-serif;color:#162b4f;margin:0}.bulletin{min-height:280mm;position:relative;page-break-after:always;break-after:page;padding:0 0 12mm}.bulletin:last-child{page-break-after:auto;break-after:auto}.school-head{display:grid;grid-template-columns:68px 1fr 65px;align-items:center;gap:8px;border-bottom:4px solid #168453;padding:4px 5px 7px;text-align:center}.seal{height:62px;width:62px;border:2px solid #168453;border-radius:50%;display:grid;place-content:center;font-size:8px;font-weight:bold;color:#16447e}.seal b{font-size:22px}.school-name>div{font-size:10px;font-weight:bold;color:#16447e}.school-name h1{font-size:17px;line-height:1.1;margin:3px;color:#16447e}.school-name p{margin:0;color:#168453;font-style:italic}.motto{font-family:Georgia,serif;font-style:italic;font-weight:bold;font-size:10px;color:#16447e}.title-band{margin:7px auto 5px;width:82%;text-align:center;background:#16447e;color:#fff;border-radius:20px;padding:5px}.title-band b{display:block;font-size:17px}.title-band span{display:block;color:#16365e;background:#ffdc42;border-radius:10px;margin:3px auto 0;padding:2px;font-weight:bold}.identity{display:flex;gap:10px;padding:5px 3px 8px;align-items:stretch}.photo{width:70px;height:82px;border:1px solid #16447e;display:grid;place-content:center;text-align:center;font-size:8px;font-weight:bold;color:#16447e;background:#eef3fa}.identity-lines{flex:1;display:grid;align-content:center;gap:4px;font-size:9px}.grades{width:100%;border-collapse:collapse;table-layout:fixed}.grades th,.grades td,.exam-section th,.exam-section td{border:1px solid #9eafc2;padding:3px 2px;text-align:center}.grades thead th{background:#16447e;color:white;font-size:7px}.grades tbody th{text-align:left;font-size:7.5px}.grades td{font-size:7.5px}.grades .comment{text-align:left;font-size:6.8px}.grades .group th{background:#168453;color:white;text-align:left}.grades th:nth-child(1){width:5%}.grades th:nth-child(2){width:19%}.grades th:nth-child(3),.grades th:nth-child(4),.grades th:nth-child(5){width:10%}.grades th:nth-child(6){width:11%}.grades th:nth-child(7){width:29%}.grades th:nth-child(8){width:6%}.summary{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}.summary>div{border:1px solid #9eafc2;border-radius:4px;overflow:hidden}.summary h3,.exam-section h3{background:#16447e;color:white;margin:0;padding:4px;font-size:8px}.summary-left>div{display:flex;justify-content:space-between;gap:4px;border-top:1px solid #ced7e2;padding:3px 5px}.summary-left>div span{font-size:7px}.council{text-align:center;background:#eef7f0}.council h3{background:#168453}.council p{font-size:8px;padding:0 5px}.exam-section{margin-top:7px}.exam-section table{width:100%;border-collapse:collapse;table-layout:fixed}.exam-section th{background:#eef3fa}.exam-section small{display:block;padding-top:3px;color:#596b80}.signatures{display:flex;justify-content:space-between;margin-top:10px;text-align:center;font-size:7px}.bulletin footer{position:absolute;bottom:0;left:0;right:0;padding:4px;border-top:2px solid #168453;text-align:center;background:#16447e;color:#fff;font-style:italic;font-size:9px}@media screen{body{background:#e9eef5}.bulletin{background:white;margin:20px auto;padding:8mm;max-width:210mm;min-height:290mm;box-shadow:0 2px 8px #0002}}
  </style></head><body>${pages}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));</script></body></html>`);
  popup.document.close();
}
async function saveNotesSheet() {
  if (!canWrite('notes')) return;
  const inputs = [...document.querySelectorAll('.notes-grade-input')];
  const changes = [];
  for (const input of inputs) {
    const raw = input.value.trim().replace(',', '.');
    if (!raw) continue;
    const score = Number(raw);
    if (!Number.isFinite(score) || score < 0 || score > 20) {
      input.focus();
      notify('Chaque note doit être comprise entre 0 et 20.');
      return;
    }
    changes.push({
      studentId: input.dataset.studentId || null,
      studentName: input.dataset.studentName || '',
      evaluation: input.dataset.evaluation,
      score: String(score)
    });
  }
  if (!changes.length) {
    notify('Aucune note à enregistrer.');
    return;
  }

  const previous = JSON.parse(JSON.stringify(data.notes));
  for (const change of changes) {
    const student = data.eleves.find(row => row.__id === change.studentId || cpegNotesKey(row.nom) === cpegNotesKey(change.studentName));
    let record = student && cpegGradeRecord(student, cpegNotesClass, cpegNotesSubject, cpegNotesTerm, change.evaluation);
    if (record) record.note = change.score;
    else {
      record = {
        __id: crypto.randomUUID(), __student_id: change.studentId, __class_name: cpegNotesClass, __created_by: dbUser.id,
        eleve: change.studentName, classe: cpegNotesClass, matiere: cpegNotesSubject,
        evaluation: change.evaluation, note: change.score, periode: cpegNotesTerm,
        date: schoolToday(), enseignant: dbProfile?.full_name || ''
      };
      data.notes.unshift(record);
    }
    record.date = schoolToday();
    record.enseignant = dbProfile?.full_name || record.enseignant || '';
  }
  try {
    await persist('notes');
    notify(`${changes.length} note(s) enregistrée(s).`);
    await notesEntryPage();
  } catch (error) {
    data.notes = previous;
    notify('Enregistrement impossible : ' + error.message);
  }
}

function installNotesEntryUI() {
  const style = document.createElement('style');
  style.textContent = `
    .notes-sheet-controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:16px 16px 0}
    .notes-sheet-controls label{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:650}
    .notes-sheet-controls select{min-width:170px}
    .notes-sheet-help{margin:12px 16px;color:var(--muted);font-size:12px}
    .notes-sheet-wrap{margin:0 16px;width:auto;max-height:65vh}
    .notes-sheet-table{min-width:1000px}
    .notes-sheet-table th,.notes-sheet-table td{text-align:center;white-space:nowrap;padding:8px}
    .notes-sheet-table th:nth-child(2),.notes-sheet-table td:nth-child(2){text-align:left;min-width:220px}
    .notes-grade-input{width:76px;min-height:38px;text-align:center;padding:6px}
    .notes-sheet-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;color:var(--muted);font-size:12px}
    .notes-sheet-empty{padding:30px 16px}
    @media(max-width:640px){.notes-sheet-controls{align-items:stretch;flex-direction:column}.notes-sheet-controls select{width:100%}.notes-sheet-footer{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);
}
