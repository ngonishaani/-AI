const POST_SIGN_REDIRECT_URL = 'https://github.com/ngonishaani/AI4I_Project/invitations';
const REDIRECT_DELAY_MS = 2000;

const NDA_SECTIONS = [
  {
    title: '1. Purpose.',
    body: 'The parties intend to explore a potential working relationship involving access to proprietary code, technical documentation, and related materials for ZimEdu (the "Purpose").',
  },
  {
    title: '2. Confidential Information.',
    body: 'Includes all non-public information disclosed by either party, including but not limited to source code, algorithms, technical specifications, product roadmaps, business plans, user data, and trade secrets, whether shared orally, in writing, or electronically.',
  },
  {
    title: '3. Obligations.',
    body: 'The Receiving Party agrees to:\n(a) Use Confidential Information solely for the Purpose;\n(b) Not disclose it to any third party without prior written consent;\n(c) Protect it with at least the same degree of care used for its own confidential information;\n(d) Not reverse-engineer, copy, or reproduce code except as necessary for the Purpose.',
  },
  {
    title: '4. Exclusions.',
    body: 'Confidential Information does not include information that:\n(a) Is or becomes publicly known through no fault of the Receiving Party;\n(b) Was rightfully known prior to disclosure;\n(c) Is independently developed without reference to Confidential Information;\n(d) Is required to be disclosed by law or court order.',
  },
  {
    title: '5. Term.',
    bodyTemplate: (term) =>
      `This Agreement remains in effect for ${term} year${term === 1 ? '' : 's'} from the date of disclosure. Obligations regarding trade secrets survive indefinitely.`,
  },
  {
    title: '6. Return of Materials.',
    body: 'Upon request, all Confidential Information and copies must be returned or destroyed.',
  },
  {
    title: '7. No License.',
    body: 'Nothing in this Agreement grants any license or ownership rights.',
  },
  {
    title: '8. Governing Law.',
    bodyTemplate: (jurisdiction) => `This Agreement shall be governed by the laws of ${jurisdiction}.`,
  },
  {
    title: '9. Entire Agreement.',
    body: 'This document constitutes the full agreement between the parties.',
  },
];

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

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSectionBody(section, term, jurisdiction) {
  if (section.bodyTemplate) {
    return section.title === '5. Term.' ? section.bodyTemplate(term) : section.bodyTemplate(jurisdiction);
  }
  return section.body;
}

function updatePreview() {
  const name = document.getElementById('teamMemberName').value.trim() || '[Team Member Name]';
  const date = formatDisplayDate(document.getElementById('agreementDate').value);
  const term = parseInt(document.getElementById('termYears').value, 10) || 2;
  const jurisdiction = document.getElementById('jurisdiction').value.trim() || 'Zimbabwe';

  const sectionsHtml = NDA_SECTIONS.map((section) => {
    const body = formatSectionBody(section, term, jurisdiction);
    return `<p class="preview-section"><strong>${escapeHtml(section.title)}</strong> ${escapeHtml(body).replace(/\n/g, '<br>')}</p>`;
  }).join('');

  preview.innerHTML = `
    <h3 class="preview-title">MUTUAL NON-DISCLOSURE AGREEMENT</h3>
    <p class="preview-intro">
      This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of
      <strong>${escapeHtml(date)}</strong> by and between:
    </p>
    <p class="preview-parties">
      <strong>ZimEdu / Zimbabwe EdTech Solutions</strong> ("Disclosing Party")<br>
      and<br>
      <strong>${escapeHtml(name)}</strong> ("Receiving Party")
    </p>
    ${sectionsHtml}
    <div class="preview-signatures">
      <p><strong>Signed:</strong></p>
      <p>___________________________<br>ZimEdu / Zimbabwe EdTech Solutions<br>Date: ${escapeHtml(date)}</p>
      <p>___________________________<br>${escapeHtml(name)}, Receiving Party<br>Date: ${escapeHtml(date)}</p>
    </div>
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

    showMessage('NDA signed successfully. Redirecting you to the project invitation…', 'success');

    setTimeout(() => {
      window.location.href = POST_SIGN_REDIRECT_URL;
    }, REDIRECT_DELAY_MS);
  } catch (err) {
    showMessage(err.message || 'Something went wrong. Please try again.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Generate & Download Signed PDF';
  }
});
