// Grille de saisie inspirée des fiches de notes papier de l'établissement.
const CPEG_NOTE_EVALUATIONS = [
  '1er inter', '2ème inter', '3ème inter', '4ème inter', '5ème inter',
  '1er devoir', '2ème devoir'
];
const CPEG_NOTE_SUBJECTS = [
  ['ANGLAIS', 'Anglais'],
  ['EPS', 'EPS / Sport'],
  ['FRANCAIS COM. ECRITE', 'Français - Communication écrite'],
  ['FRANCAIS LECTURE', 'Français - Lecture'],
  ['HIST-GEO', 'Histoire-Géographie'],
  ['MATHS GENE', 'Mathématiques générales'],
  ['PCT', 'PCT'],
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
      ${classStudents.length ? `<div class="table-wrap notes-sheet-wrap"><table class="notes-sheet-table"><thead><tr><th>N°</th><th>Nom et prénom(s) de l’élève</th>${CPEG_NOTE_EVALUATIONS.map(label => `<th>${label}</th>`).join('')}</tr></thead>
        <tbody>${classStudents.map((student, index) => `<tr><td>${index + 1}</td><td>${esc(student.nom || '')}</td>${CPEG_NOTE_EVALUATIONS.map(evaluation => {
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
  if (!students.length) {
    notify('Aucun élève n’est enregistré dans cette classe.');
    return;
  }
  const subjectOptions = cpegSubjectsForClass(className);
  const getScores = (student, subject) => CPEG_NOTE_EVALUATIONS.map(evaluation => {
    const note = cpegGradeRecord(student, className, subject, term, evaluation);
    if (!note || String(note.note ?? '').trim() === '') return null;
    const score = Number(String(note.note).replace(',', '.'));
    return Number.isFinite(score) ? score : null;
  });
  const mean = values => {
    const present = values.filter(value => value !== null);
    return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
  };
  const summaries = students.map(student => {
    const subjects = subjectOptions.map(([key, label]) => {
      const scores = getScores(student, key);
      const interros = mean(scores.slice(0, 5));
      const average = interros === null || scores[5] === null || scores[6] === null
        ? null : (interros + scores[5] + scores[6]) / 3;
      return { key, label, scores, average };
    });
    return { student, subjects, overall: mean(subjects.map(subject => subject.average).filter(value => value !== null)) };
  });
  const sorted = summaries.filter(row => row.overall !== null).slice().sort((a, b) => b.overall - a.overall);
  const rank = new Map();
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    rank.set(row.student.__id, previous && Math.abs(previous.overall - row.overall) < 0.0001 ? rank.get(previous.student.__id) : index + 1);
  });
  if (!summaries.some(row => row.overall !== null)) {
    notify('Aucune note n’a été enregistrée pour cette classe et ce trimestre.');
    return;
  }
  const popup = window.open('', '_blank');
  if (!popup) {
    notify('Autorisez les fenêtres contextuelles pour générer les bulletins.');
    return;
  }
  const format = value => value === null ? '—' : value.toFixed(2).replace('.', ',');
  const pages = summaries.map(({ student, subjects, overall }) => `
    <article class="bulletin">
      <header><h1>${esc(dbSchool?.name || 'CS L’Arbre de Succès')}</h1><h2>BULLETIN DE NOTES — ${esc(term.toUpperCase())}</h2><p>Année scolaire : ${esc(currentYear())}</p></header>
      <section class="identity"><span><b>Élève :</b> ${esc(student.nom || '')}</span><span><b>Classe :</b> ${esc(className)}</span><span><b>Rang :</b> ${rank.has(student.__id) ? rank.get(student.__id) : '—'} / ${students.length}</span></section>
      <table><thead><tr><th>Matière</th>${CPEG_NOTE_EVALUATIONS.map(label => `<th>${esc(label)}</th>`).join('')}<th>Moyenne /20</th></tr></thead><tbody>
        ${subjects.map(subject => `<tr><th>${esc(subject.label)}</th>${subject.scores.map(score => `<td>${format(score)}</td>`).join('')}<td><b>${format(subject.average)}</b></td></tr>`).join('')}
      </tbody></table>
      <div class="overall"><b>Moyenne générale :</b> ${format(overall)} / 20 <span>Calcul par matière : (moyenne des interrogations + 1er devoir + 2e devoir) ÷ 3 · La moyenne générale est la moyenne des moyennes disponibles.</span></div>
      <div class="signatures"><span>Appréciation : ______________________________________________</span><span>Le Chef d’établissement : _________________________</span></div>
      <footer>Complexe Scolaire L’Arbre de Succès · ${esc(term)} · ${esc(className)}</footer>
    </article>`).join('');
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bulletins - ${esc(className)} - ${esc(term)}</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#182235;margin:0}.bulletin{min-height:180mm;position:relative;page-break-after:always;break-after:page;padding-bottom:24mm}.bulletin:last-child{page-break-after:auto;break-after:auto}header{text-align:center;border-bottom:2px solid #173d78;padding:0 0 8px}h1{font-size:22px;margin:0;color:#173d78}h2{font-size:17px;margin:7px 0 4px}header p{margin:4px}.identity{display:flex;justify-content:space-between;gap:18px;padding:12px 0;font-size:13px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #596476;padding:7px 4px;text-align:center;font-size:10px}thead th{background:#e9eef8}tbody th{text-align:left;width:22%;font-size:11px}.overall{margin-top:14px;padding:12px;background:#f1f5fb;font-size:16px}.overall span{display:block;margin-top:6px;font-size:10px;color:#596476}.signatures{display:flex;justify-content:space-between;margin-top:28px;font-size:11px}.bulletin footer{position:absolute;bottom:0;left:0;right:0;padding-top:6px;border-top:1px solid #b8c2d1;text-align:center;color:#596476;font-size:9px}@media screen{body{background:#e8edf5}.bulletin{background:white;margin:20px auto;padding:16mm;max-width:275mm;min-height:190mm;box-shadow:0 2px 8px #0002}}
  </style></head><body>${pages}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`);
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
