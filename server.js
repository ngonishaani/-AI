const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'Unknown';
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return dateStr;
  }
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function generateNdaPdf({ teamMemberName, agreementDate, termYears, jurisdiction, ipAddress, signedAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const formattedDate = formatDate(agreementDate);
    const signedTimestamp = new Date(signedAt).toUTCString();

    doc.fontSize(16).font('Helvetica-Bold').text('MUTUAL NON-DISCLOSURE AGREEMENT', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11).font('Helvetica');
    doc.text(
      `This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of ${formattedDate} by and between:`,
      { align: 'justify' }
    );
    doc.moveDown();

    doc.font('Helvetica-Bold').text('ZimEdu / Zimbabwe EdTech Solutions', { continued: true });
    doc.font('Helvetica').text(' ("Disclosing Party")');
    doc.text('and');
    doc.font('Helvetica-Bold').text(teamMemberName, { continued: true });
    doc.font('Helvetica').text(' ("Receiving Party")');
    doc.moveDown();

    const sections = [
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
        body: `This Agreement remains in effect for ${termYears} year${termYears === 1 ? '' : 's'} from the date of disclosure. Obligations regarding trade secrets survive indefinitely.`,
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
        body: `This Agreement shall be governed by the laws of ${jurisdiction}.`,
      },
      {
        title: '9. Entire Agreement.',
        body: 'This document constitutes the full agreement between the parties.',
      },
    ];

    sections.forEach(({ title, body }) => {
      doc.font('Helvetica-Bold').text(title, { continued: true });
      doc.font('Helvetica').text(` ${body}`, { align: 'justify' });
      doc.moveDown(0.5);
    });

    doc.moveDown();
    doc.font('Helvetica-Bold').text('Signed:');
    doc.moveDown(1);

    doc.font('Helvetica').text('___________________________');
    doc.text('ZimEdu / Zimbabwe EdTech Solutions');
    doc.text(`Date: ${formattedDate}`);
    doc.moveDown(1.5);

    doc.text('___________________________');
    doc.text(`${teamMemberName}, Receiving Party`);
    doc.text(`Date: ${formattedDate}`);
    doc.moveDown(2);

    doc.fontSize(9).fillColor('#444444');
    doc.text('— Electronic Signature Record —', { align: 'center' });
    doc.moveDown(0.5);
    doc.text(`Signed electronically by: ${teamMemberName}`);
    doc.text(`IP Address: ${ipAddress}`);
    doc.text(`Signed at (UTC): ${signedTimestamp}`);
    doc.text('This document was generated electronically. A local lawyer should review this template before use.');

    doc.end();
  });
}

app.post('/api/generate-nda', async (req, res) => {
  try {
    const { teamMemberName, agreementDate, termYears, jurisdiction } = req.body;

    if (!teamMemberName || !teamMemberName.trim()) {
      return res.status(400).json({ error: 'Team member name is required.' });
    }

    if (!agreementDate) {
      return res.status(400).json({ error: 'Agreement date is required.' });
    }

    const term = parseInt(termYears, 10) || 2;
    const juris = (jurisdiction || 'Zimbabwe').trim();
    const signedAt = new Date().toISOString();
    const ipAddress = getClientIp(req);

    const pdfBuffer = await generateNdaPdf({
      teamMemberName: teamMemberName.trim(),
      agreementDate,
      termYears: term,
      jurisdiction: juris,
      ipAddress,
      signedAt,
    });

    const safeName = teamMemberName.trim().replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `ZimEdu_NDA_${safeName}_${agreementDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'Failed to generate PDF. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`ZimEdu NDA signer running at http://localhost:${PORT}`);
});
