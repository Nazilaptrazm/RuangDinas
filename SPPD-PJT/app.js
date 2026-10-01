const defaultPlaces = [
  { name: 'Jakarta' },
  { name: 'Bandung' },
  { name: 'Yogyakarta' },
  { name: 'Surabaya' },
  { name: 'Lainnya' }
];
const ONLINE_FEE = 150000;
let tariffRows = [];
let positionTransportRates = [];
let mode = 'offline';
let selectedEmployee = null;
let searchTimer;
const $ = id => document.getElementById(id);
const rupiah = value => 'Rp ' + Math.round(value || 0).toLocaleString('id-ID');
const key = value => String(value || '').trim().toLocaleLowerCase('id-ID');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

$('today').textContent = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
}).format(new Date());

function placesList() {
  if (tariffRows.length) {
    const type = $('tripType')?.value;
    const matches = tariffRows.filter(row => key(row.jenis_perjalanan) === key(type));
    return [...new Map(matches.map(row => [key(row.lokasi), { name: row.lokasi }])).values()];
  }
  const list = [...defaultPlaces];
  return list;
}

function hotelClassForPosition(position) {
  const role = key(position).toUpperCase().replace(/\s+/g, '');
  if (['DEWANPENGAWAS', 'DIREKSI', 'DEWANPENGAWASDANDIREKSI', 'BOD-1'].includes(role)) return 'Bintang 5';
  if (/^BOD-[2-5]$/.test(role)) return 'Bintang 4';
  return 'Belum ditentukan';
}

function buildOptions(placeValue) {
  const places = placesList();
  $('place').innerHTML = places.map(place =>
    `<option value="${escapeHtml(place.name)}">${escapeHtml(place.name)}</option>`).join('');
  if (!places.length) $('place').innerHTML = '<option value="">Impor lokasi untuk jenis perjalanan ini</option>';
  if (placeValue && places.some(place => key(place.name) === key(placeValue))) $('place').value = placeValue;
  $('rateCount').textContent = tariffRows.length ? `${tariffRows.length} kombinasi` : 'Belum diimpor';
}

function currentTariff() {
  const roleName = selectedEmployee?.jabatan || '';
  const placeName = $('place').value;
  const travelType = $('tripType').value;
  const manualRequired = ['BOD-1', 'BOD-2'].includes(key(roleName).toUpperCase());
  const manualValue = $('manualTransport')?.value.trim() ?? '';
  const manualTransport = manualValue === '' ? 0 : Math.max(0, Number(manualValue) || 0);
  const fixedTransport = positionTransportRates.find(row => key(row.jabatan) === key(roleName));
  if (!roleName) return {
    jenis_perjalanan: travelType, jabatan: '', lokasi: placeName, uang_harian: 0, uang_transportasi: 0,
    transportasi_tersedia: false, biaya_pelatihan_online: ONLINE_FEE, source: 'belum dipilih'
  };
  const imported = tariffRows.find(row => key(row.jenis_perjalanan) === key(travelType)
    && key(row.jabatan) === key(roleName) && key(row.lokasi) === key(placeName));
  const transportAvailable = manualRequired ? manualValue !== '' : Boolean(fixedTransport || imported?.transportasi_tersedia);
  const transportValue = manualRequired ? manualTransport : (fixedTransport?.uang_transportasi ?? imported?.uang_transportasi ?? 0);
  if (imported) return {
    ...imported, uang_transportasi: transportValue, transportasi_tersedia: transportAvailable,
    transportasi_manual: manualRequired, source: 'CSV'
  };

  return {
    jenis_perjalanan: travelType,
    jabatan: roleName,
    lokasi: placeName,
    uang_harian: 0,
    uang_transportasi: transportValue,
    transportasi_tersedia: transportAvailable,
    transportasi_manual: manualRequired,
    biaya_pelatihan_offline: 0,
    biaya_pelatihan_online: ONLINE_FEE,
    source: 'belum diimpor'
  };
}

function updateEmployeeDetail(tariff) {
  if (!selectedEmployee) return;
  const transportLabel = tariff.transportasi_manual && tariff.transportasi_tersedia === false
    ? 'Masukkan manual' : tariff.transportasi_tersedia === false ? 'Belum diimpor' : rupiah(tariff.uang_transportasi);
  const hotelClass = hotelClassForPosition(selectedEmployee.jabatan);
  $('employeeDetail').classList.add('selected');
  $('employeeDetail').innerHTML = `<b>NIK</b> ${escapeHtml(selectedEmployee.nik)} &nbsp;·&nbsp; <b>Nama</b> ${escapeHtml(selectedEmployee.nama)}<br>
    <b>Jabatan</b> ${escapeHtml(selectedEmployee.jabatan || '—')} &nbsp;·&nbsp; <b>Golongan</b> ${escapeHtml(selectedEmployee.golongan || '—')}<br>
    <b>Unit kerja</b> ${escapeHtml(selectedEmployee.unit_kerja || '—')} &nbsp;·&nbsp; <b>Divisi</b> ${escapeHtml(selectedEmployee.divisi || '—')}<br>
    <b>Kelas hotel</b> ${hotelClass}<br>
    <b>Jenis perjalanan</b> ${escapeHtml(tariff.jenis_perjalanan)} · ${escapeHtml(tariff.lokasi)}<br>
    <b>Uang harian</b> ${rupiah(tariff.uang_harian)} / hari &nbsp;·&nbsp; <b>Transport</b> ${transportLabel}<br>
    <b>Tarif</b> ${tariff.source === 'CSV' ? 'data impor' : tariff.source === 'contoh' ? 'contoh sementara' : 'belum diimpor'}`;
}

function calculate() {
  const tariff = { ...currentTariff(), biaya_pelatihan_offline: 0, biaya_pelatihan_online: ONLINE_FEE };
  const lodgingInput = $('lodgingCost').value.trim();
  const lodgingApplicable = mode !== 'online';
  const lodgingCost = !lodgingApplicable || lodgingInput === '' ? 0 : Math.max(0, Number(lodgingInput) || 0);
  const hotelClass = selectedEmployee ? hotelClassForPosition(selectedEmployee.jabatan) : 'Belum ditentukan';
  $('hotelClassNote').textContent = selectedEmployee
    ? `Kelas hotel untuk jabatan ${selectedEmployee.jabatan}: ${hotelClass}. Masukkan total biaya penginapan untuk perjalanan ini.`
    : 'Pilih karyawan untuk menampilkan kelas hotel sesuai jabatan.';
  const singleDays = Math.max(1, parseInt($('days').value, 10) || 1);
  const offlineDays = mode === 'gabungan'
    ? Math.max(1, parseInt($('offlineDays').value, 10) || 1)
    : (mode === 'offline' ? singleDays : 0);
  const onlineDays = mode === 'gabungan'
    ? Math.max(1, parseInt($('onlineDays').value, 10) || 1)
    : (mode === 'online' ? singleDays : 0);
  const items = [];
  const manualTransportRequired = ['BOD-1', 'BOD-2'].includes(key(selectedEmployee?.jabatan).toUpperCase());
  $('manualTransportField').hidden = !manualTransportRequired;
  $('lodgingField').hidden = !lodgingApplicable;
  if (mode !== 'online') {
    items.push(['Uang harian', tariff.uang_harian * offlineDays, `${rupiah(tariff.uang_harian)} × ${offlineDays} hari offline`]);
    if (tariff.transportasi_tersedia !== false) {
      items.push(['Transportasi', tariff.uang_transportasi, 'Satu kali per perjalanan dinas · pulang-pergi']);
    }
  }
  if (mode === 'online' || mode === 'gabungan') {
    items.push(['Pelatihan online', tariff.biaya_pelatihan_online * onlineDays, `${rupiah(tariff.biaya_pelatihan_online)} × ${onlineDays} hari`]);
  }
  if (lodgingApplicable && lodgingInput !== '') {
    items.push(['Penginapan', lodgingCost, `Total biaya manual · ${hotelClass}`]);
  }
  const perPerson = items.reduce((sum, item) => sum + item[1], 0);
  const total = perPerson;
  $('grandTotal').textContent = rupiah(total);
  $('perPerson').textContent = rupiah(perPerson);
  $('breakdown').innerHTML = items.map(([label, amount, detail]) =>
    `<div class="line-item"><div class="line-label">${label}<small>${detail}</small></div><div class="line-amount">${rupiah(amount)}</div></div>`
  ).join('');

  const descriptions = {
    offline: 'Uang harian dan transportasi mengikuti jabatan serta lokasi pelatihan. Biaya pelatihan offline sudah termasuk dalam uang harian.',
    online: 'Online menghitung biaya Rp150.000 per hari; uang harian dan transportasi tidak dihitung.',
    gabungan: `Uang harian untuk ${offlineDays} hari offline sudah mencakup komponen pelatihan offline; transportasi dihitung satu kali dan biaya online Rp150.000 × ${onlineDays} hari.`
  };
  $('singleDurationField').hidden = mode === 'gabungan';
  $('offlineDurationField').hidden = mode !== 'gabungan';
  $('onlineDurationField').hidden = mode !== 'gabungan';
  const missingTariff = tariff.source === 'belum diimpor'
    ? ` Belum ada tarif CSV untuk ${$('tripType').value}, ${selectedEmployee?.jabatan || 'jabatan ini'}, ${$('place').value || 'lokasi ini'}.` : '';
  const missingEmployee = tariff.source === 'belum dipilih'
    ? ' Pilih karyawan dari hasil pencarian untuk menampilkan jabatan dan uang hariannya.' : '';
  const missingTransport = selectedEmployee && mode !== 'online' && tariff.transportasi_tersedia === false
    ? (tariff.transportasi_manual
      ? ' Masukkan biaya transportasi untuk BOD-1/BOD-2 agar masuk ke total.'
      : ' Tarif transportasi belum diimpor, jadi belum masuk ke total.') : '';
  const missingLodging = selectedEmployee && lodgingApplicable && lodgingInput === ''
    ? ' Biaya penginapan belum diisi manual, jadi belum masuk ke total.' : '';
  $('modeNote').textContent = `${descriptions[mode]}${missingEmployee}${missingTariff}${missingTransport}${missingLodging}`;
  updateEmployeeDetail(tariff);
  window.currentEstimate = {
    person: selectedEmployee?.nama || 'Peserta', nik: selectedEmployee?.nik || '',
    jabatan: selectedEmployee?.jabatan || '',
    golongan: selectedEmployee?.golongan || '', unitKerja: selectedEmployee?.unit_kerja || '',
    mode, days: mode === 'gabungan' ? null : singleDays,
    offlineDays, onlineDays, tariff, items, total, perPerson,
    lodgingCost, lodgingEntered: lodgingApplicable && lodgingInput !== '', hotelClass
  };
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2300);
}

function closeModal() {
  $('modalBackdrop').classList.remove('open');
}

function downloadCsv(filename, header) {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + header + '\n'], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function importCsv(file, endpoint, statusElement, onSuccess) {
  if (!file) return;
  statusElement.textContent = 'Mengimpor data…';
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'text/csv;charset=utf-8' }, body: await file.text()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Impor gagal');
    statusElement.textContent = `Berhasil: ${result.imported} baris disimpan/diperbarui. Dilewati: ${result.skipped} baris.`;
    toast('CSV berhasil diimpor');
    if (onSuccess) await onSuccess();
  } catch (error) {
    statusElement.textContent = error.message || 'Tidak dapat menghubungi database. Pastikan server berjalan.';
  }
}

async function refreshTariffs() {
  const response = await fetch('/api/rates');
  const data = await response.json();
  const place = $('place').value;
  tariffRows = data.rates || [];
  positionTransportRates = data.position_transport_rates || [];
  buildOptions(place);
  calculate();
}

function openDataManager() {
  $('modalTitle').textContent = 'Impor CSV karyawan dan tarif';
  $('modalBody').innerHTML = `<p>Impor data karyawan, tarif lengkap, atau tabel uang harian Dalam Negeri secara terpisah. Jabatan dan daerah dipakai untuk mencocokkan tarif. Tarif <b>Dalam Negeri</b> dan <b>Luar Negeri</b> dapat berbeda.</p>
    <div class="import-box"><label>1. CSV karyawan & jabatan</label><button class="btn" id="employeeTemplate" type="button">↓ &nbsp; Unduh template karyawan</button>
      <div style="margin:12px 0 7px"><input id="employeeCsv" type="file" accept=".csv,text/csv"></div>
      <div class="import-help">Kolom wajib: NIK, Nama, dan Jabatan. CSV dengan pemisah koma atau titik koma bisa digunakan; kolom tambahan seperti Unit Kerja, Divisi, dan Uraian akan ikut disimpan. Format jabatan BOD 3 juga dikenali sebagai BOD-3.</div>
      <div id="employeeImportStatus" class="import-help" style="margin-top:8px"></div></div>
    <div class="import-box"><label>2. CSV uang harian & transportasi</label><button class="btn" id="rateTemplate" type="button">↓ &nbsp; Unduh template tarif</button>
      <div style="margin:12px 0 7px"><input id="rateCsv" type="file" accept=".csv,text/csv"></div>
      <div class="import-help">Kolom: <b>jenis_perjalanan,jabatan,lokasi,uang_harian,uang_transportasi</b>. Jenis perjalanan diisi <b>Dalam Negeri</b> atau <b>Luar Negeri</b>; jabatan harus sama dengan CSV karyawan. Isi satu baris per jenis perjalanan, jabatan, dan lokasi. Biaya online tetap Rp150.000 per hari.</div>
      <div id="rateImportStatus" class="import-help" style="margin-top:8px"></div></div>`;
  $('modalBody').insertAdjacentHTML('beforeend', `<div class="import-box"><label>3. CSV tabel uang harian Dalam Negeri</label>
      <div style="margin:12px 0 7px"><input id="dailyCsv" type="file" accept=".csv,text/csv"></div>
      <div class="import-help">Impor file uang harian berbentuk tabel daerah pada kolom ketiga dan jabatan BOD-1 sampai BOD-5 pada baris kedua. Tarif transportasi belum ada di file ini dan dapat dimasukkan terpisah.</div>
      <div id="dailyImportStatus" class="import-help" style="margin-top:8px"></div></div>
    <div class="import-box"><label>4. CSV tabel uang harian Luar Negeri</label>
      <div style="margin:12px 0 7px"><input id="foreignDailyCsv" type="file" accept=".csv,text/csv"></div>
      <div class="import-help">Jabatan BOD-1 sampai BOD-5 akan dicocokkan dengan data karyawan. Kolom Dewan Pengawas dan Direksi tidak dipakai. Tarif transportasi belum ada di file ini.</div>
      <div id="foreignDailyImportStatus" class="import-help" style="margin-top:8px"></div></div>
    <div class="import-box"><label>5. CSV biaya transportasi jabatan BOD-3 sampai BOD-5</label>
      <div style="margin:12px 0 7px"><input id="transportCsv" type="file" accept=".csv,text/csv"></div>
      <div class="import-help">Impor tabel jabatan dan nominal transportasi. BOD-1 dan BOD-2 diisi manual pada formulir setelah karyawannya dipilih.</div>
      <div id="transportImportStatus" class="import-help" style="margin-top:8px"></div></div>`);
  $('modalBackdrop').classList.add('open');
  $('employeeTemplate').addEventListener('click', () => downloadCsv('template-karyawan-sppd.csv', 'nik,nama,jabatan,golongan,unit_kerja'));
  $('rateTemplate').addEventListener('click', () => downloadCsv('template-tarif-sppd.csv', 'jenis_perjalanan,jabatan,lokasi,uang_harian,uang_transportasi'));
  $('employeeCsv').addEventListener('change', event =>
    importCsv(event.target.files[0], '/api/employees/import', $('employeeImportStatus')));
  $('rateCsv').addEventListener('change', event =>
    importCsv(event.target.files[0], '/api/rates/import', $('rateImportStatus'), refreshTariffs));
  $('dailyCsv').addEventListener('change', event =>
    importCsv(event.target.files[0], '/api/daily-rates/import', $('dailyImportStatus'), refreshTariffs));
  $('foreignDailyCsv').addEventListener('change', event =>
    importCsv(event.target.files[0], '/api/daily-rates/foreign/import', $('foreignDailyImportStatus'), refreshTariffs));
  $('transportCsv').addEventListener('change', event =>
    importCsv(event.target.files[0], '/api/transport-rates/import', $('transportImportStatus'), refreshTariffs));
}

function renderEmployeeResults(employees) {
  const results = $('employeeResults');
  if (!employees.length) {
    results.innerHTML = '<div class="employee-option"><small>Tidak ada hasil yang cocok.</small></div>';
    results.classList.add('open');
    return;
  }
  results.innerHTML = employees.map((employee, index) =>
    `<div class="employee-option" data-result="${index}"><b>${escapeHtml(employee.nama)}</b><small>NIK ${escapeHtml(employee.nik)} · ${escapeHtml(employee.jabatan || 'Jabatan belum diisi')} · ${escapeHtml(employee.unit_kerja || 'Unit belum diisi')}</small></div>`
  ).join('');
  results.classList.add('open');
  results.querySelectorAll('[data-result]').forEach(option =>
    option.addEventListener('click', () => selectEmployee(employees[Number(option.dataset.result)])));
}

function selectEmployee(employee) {
  selectedEmployee = employee;
  $('manualTransport').value = '';
  $('lodgingCost').value = '';
  $('person').value = employee.nama;
  $('employeeSearch').value = `${employee.nama} · ${employee.nik}`;
  $('employeeResults').classList.remove('open');
  calculate();
}

document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(option => option.classList.toggle('active', option === button));
    calculate();
  });
});
['place', 'days', 'offlineDays', 'onlineDays', 'person', 'manualTransport', 'lodgingCost'].forEach(id => $(id).addEventListener('input', calculate));
['place'].forEach(id => $(id).addEventListener('change', calculate));
$('tripType').addEventListener('change', () => {
  const place = $('place').value;
  buildOptions(place);
  calculate();
});
$('manageEmployees').addEventListener('click', openDataManager);
$('closeModal').addEventListener('click', closeModal);
$('modalBackdrop').addEventListener('click', event => {
  if (event.target === $('modalBackdrop')) closeModal();
});
$('employeeSearch').addEventListener('input', () => {
  selectedEmployee = null;
  $('manualTransport').value = '';
  $('lodgingCost').value = '';
  $('person').value = '';
  $('employeeDetail').classList.remove('selected');
  $('employeeDetail').textContent = 'Pilih karyawan untuk menampilkan jabatan dan tarif sesuai jabatan serta lokasi.';
  const query = $('employeeSearch').value.trim();
  clearTimeout(searchTimer);
  if (query.length < 2) {
    $('employeeResults').classList.remove('open');
    calculate();
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const response = await fetch(`/api/employees?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      renderEmployeeResults(data.employees || []);
    } catch {
      $('employeeResults').innerHTML = '<div class="employee-option"><small>Database belum terhubung. Jalankan website melalui python app.py.</small></div>';
      $('employeeResults').classList.add('open');
    }
  }, 180);
  calculate();
});
document.addEventListener('click', event => {
  if (!event.target.closest('.employee-search')) $('employeeResults').classList.remove('open');
});
$('resetBtn').addEventListener('click', () => {
  selectedEmployee = null;
  $('manualTransport').value = '';
  $('lodgingCost').value = '';
  $('person').value = '';
  $('employeeSearch').value = '';
  $('employeeDetail').classList.remove('selected');
  $('employeeDetail').textContent = 'Pilih karyawan untuk menampilkan jabatan dan tarif sesuai jabatan serta lokasi.';
  $('tripType').value = 'Dalam Negeri';
  buildOptions(defaultPlaces[0].name);
  $('days').value = 3;
  $('offlineDays').value = 3;
  $('onlineDays').value = 2;
  mode = 'offline';
  document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  calculate();
});

function xmlEscape(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xlsxCell(reference, value, style = 0) {
  if (value === null || value === undefined || value === '') return `<c r="${reference}" s="${style}"/>`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function xlsxRow(rowNumber, cells, height) {
  const content = cells.map(([column, value, style]) => xlsxCell(`${column}${rowNumber}`, value, style)).join('');
  return `<row r="${rowNumber}"${height ? ` ht="${height}" customHeight="1"` : ''}>${content}</row>`;
}

function zipStored(files) {
  const encoder = new TextEncoder();
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let bit = 0; bit < 8; bit++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    return c >>> 0;
  });
  const crc32 = bytes => {
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
  const parts = [];
  const central = [];
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034B50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true);
    lv.setUint32(14, checksum, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length);
    parts.push(local);

    const directory = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(directory.buffer);
    dv.setUint32(0, 0x02014B50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, dosTime, true);
    dv.setUint16(14, dosDate, true); dv.setUint32(16, checksum, true); dv.setUint32(20, data.length, true);
    dv.setUint32(24, data.length, true); dv.setUint16(28, nameBytes.length, true); dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true); dv.setUint16(34, 0, true); dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true); dv.setUint32(42, offset, true); directory.set(nameBytes, 46);
    central.push(directory);
    offset += local.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054B50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
  return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function buildEstimateWorkbook(data) {
  const dateText = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const fields = [
    ['Karyawan', data.person], ['NIK', data.nik || '—'], ['Jabatan', data.jabatan || '—'],
    ['Unit kerja', data.unitKerja || '—'], ['Golongan', data.golongan || '—'],
    ['Jenis perjalanan dinas', data.tariff.jenis_perjalanan], ['Daerah pelatihan', data.tariff.lokasi || '—'],
    ['Jenis pelatihan', data.mode === 'gabungan' ? 'Gabungan' : data.mode === 'online' ? 'Online' : 'Offline'],
    ['Lama kegiatan offline (hari)', data.offlineDays], ['Lama kegiatan online (hari)', data.onlineDays],
    ['Uang harian per hari', Number(data.tariff.uang_harian) || 0],
    ['Transportasi', data.tariff.transportasi_tersedia === false
      ? (data.tariff.transportasi_manual ? 'Belum diisi manual' : 'Belum diimpor')
      : Number(data.tariff.uang_transportasi) || 0],
    ['Kelas hotel', data.hotelClass],
    ['Biaya penginapan total', data.lodgingEntered ? data.lodgingCost : 'Belum diisi manual']
  ];
  const detailItems = data.items.map(([label, amount, detail]) => [label, detail, amount]);
  if (data.mode !== 'online' && data.tariff.transportasi_tersedia === false) {
    detailItems.push(['Transportasi', data.tariff.transportasi_manual ? 'Menunggu input manual' : 'Tarif belum diimpor', null]);
  }
  const rows = [xlsxRow(1, [['A', 'RINCIAN ANGGARAN PERJALANAN DINAS', 1]], 32),
    xlsxRow(2, [['A', `Ruang Dinas  ·  Dicetak ${dateText}`, 2]], 22),
    xlsxRow(4, [['A', 'DATA PERJALANAN', 3]], 24)];
  fields.forEach(([label, value], index) => {
    const row = index + 5;
    const currencyField = ['Uang harian per hari', 'Transportasi', 'Biaya penginapan total'].includes(label) && typeof value === 'number';
    const style = currencyField ? 6 : 5;
    rows.push(xlsxRow(row, [['A', label, 4], ['B', value, style]]));
  });
  const sectionRow = 5 + fields.length;
  const headerRow = sectionRow + 1;
  const detailStartRow = headerRow + 1;
  rows.push(xlsxRow(sectionRow, [['A', 'RINCIAN BIAYA', 3]], 24));
  rows.push(xlsxRow(headerRow, [['A', 'Komponen', 7], ['B', 'Perhitungan', 7], ['C', 'Jumlah (Rp)', 7]], 24));
  detailItems.forEach(([label, detail, amount], index) => {
    const row = detailStartRow + index;
    rows.push(xlsxRow(row, [['A', label, 5], ['B', detail, 5], ['C', amount, amount === null ? 5 : 6]]));
  });
  const lastDetailRow = headerRow + detailItems.length;
  const totalRow = lastDetailRow + 1;
  rows.push(xlsxRow(totalRow, [['A', 'TOTAL PERJALANAN DINAS', 8], ['C', Number(data.total) || 0, 8]], 26));
  const hasMissingTransport = data.mode !== 'online' && data.tariff.transportasi_tersedia === false;
  const noteRow = totalRow + 2;
  const notes = [];
  if (hasMissingTransport) notes.push(data.tariff.transportasi_manual
    ? 'Biaya transportasi belum diisi manual; total belum termasuk biaya transportasi.'
    : 'Tarif transportasi belum diimpor; total belum termasuk biaya transportasi.');
  if (!data.nik) notes.push('Pilih karyawan dari daftar pencarian untuk melengkapi identitas dan jabatan.');
  if (data.nik && !data.lodgingEntered) notes.push(`Biaya penginapan belum diisi manual. Kelas hotel: ${data.hotelClass}.`);
  if (notes.length) rows.push(xlsxRow(noteRow, [['A', notes.join(' '), 9]]));
  const finalRow = notes.length ? noteRow : totalRow;
  const merges = ['A1:C1', 'A2:C2', 'A4:C4', `A${sectionRow}:C${sectionRow}`, `A${totalRow}:B${totalRow}`];
  for (let row = 5; row < sectionRow; row++) merges.push(`B${row}:C${row}`);
  if (notes.length) merges.push(`A${noteRow}:C${noteRow}`);
  const filterEnd = Math.max(headerRow, lastDetailRow);
  const frozenRow = headerRow;
  const firstDetailCell = `A${detailStartRow}`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C${finalRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${frozenRow}" topLeftCell="${firstDetailCell}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${firstDetailCell}" sqref="${firstDetailCell}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/><cols><col min="1" max="1" width="32" customWidth="1"/><col min="2" max="2" width="48" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A${headerRow}:C${filterEnd}"/><mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="1"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Rp&quot; #,##0"/></numFmts><fonts count="5"><font><sz val="11"/><color rgb="FF24342D"/><name val="Aptos"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FF24342D"/><name val="Aptos"/></font><font><i/><sz val="10"/><color rgb="FF68766F"/><name val="Aptos"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF145A45"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4F1EA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F7F4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD4E1D9"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="3" fillId="3" borderId="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rincian Anggaran" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': styles,
    'xl/worksheets/sheet1.xml': sheet
  };
  return zipStored(files);
}

$('exportBtn').addEventListener('click', () => {
  const data = window.currentEstimate;
  const workbook = buildEstimateWorkbook(data);
  const url = URL.createObjectURL(workbook);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Rincian_Anggaran_${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
  toast('File Excel berhasil diunduh');
});

async function init() {
  buildOptions('Jakarta');
  try {
    const response = await fetch('/api/rates');
    const data = await response.json();
    tariffRows = data.rates || [];
    positionTransportRates = data.position_transport_rates || [];
    buildOptions('Jakarta');
  } catch { /* rate data remains unavailable until the local server reconnects */ }
  calculate();
}
$('navGuide').addEventListener('click', () => toast('Pilih karyawan, jenis pelatihan, lokasi, dan durasi; lalu unduh rincian anggaran.'));
init();
