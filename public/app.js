const form = document.getElementById('nda-form');
const preview = document.getElementById('nda-preview');
const messageEl = document.getElementById('form-message');
const submitBtn = document.getElementById('submit-btn');
const dateInput = document.getElementById('agreementDate');

dateInput.value = new Date().toISOString().split('T')[0];

function formatDisplayDate(dateStr) {
  if (!dateStr) return '[Date]';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function updatePreview() {
  const name = document.getElementById('teamMemberName').value.trim() || '[Team Member Name]';
  const date = formatDisplayDate(document.getElementById('agreementDate').value);
  const term = document.getElementById('termYears').value;
  const jurisdiction = document.getElementById('jurisdiction').value.trim() || 'Zimbabwe';

  preview.innerHTML = `
    <strong>MUTUAL NON-DISCLOSURE AGREEMENT</strong><br><br>
    Entered into as of <strong>${date}</strong> between
    <strong>ZimEdu / Zimbabwe EdTech Solutions</strong> (Disclosing Party) and
    <strong>${name}</strong> (Receiving Party).<br><br>
    Covers confidential information including source code, technical specs, and business plans.
    Term: <strong>${term} year${term === '1' ? '' : 's'}</strong>.
    Governed by the laws of <strong>${jurisdiction}</strong>.
  `;
}

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message visible ${type}`;
}

function clearMessage() {
  messageEl.className = 'message';
  messageEl.textContent = '';
}

['teamMemberName', 'agreementDate', 'termYears', 'jurisdiction'].forEach((id) => {
  document.getElementById(id).addEventListener('input', updatePreview);
  document.getElementById(id).addEventListener('change', updatePreview);
});

updatePreview();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = {
    teamMemberName: document.getElementById('teamMemberName').value.trim(),
    agreementDate: document.getElementById('agreementDate').value,
    termYears: document.getElementById('termYears').value,
    jurisdiction: document.getElementById('jurisdiction').value.trim(),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Generating PDF…';

  try {
    const response = await fetch('/api/generate-nda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate PDF.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = payload.teamMemberName.replace(/[^a-zA-Z0-9-_]/g, '_');
    link.href = url;
    link.download = `ZimEdu_NDA_${safeName}_${payload.agreementDate}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showMessage('Your signed NDA PDF has been downloaded successfully.', 'success');
  } catch (err) {
    showMessage(err.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Generate & Download Signed PDF';
  }
});
