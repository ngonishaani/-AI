const PDFDocument = require('pdfkit');
const { getNdaSections } = require('./nda-content');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'] || req.headers['x-vercel-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp;
  return req.socket?.remoteAddress || 'Unknown';
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

function generateNdaPdf({ teamMemberName, agreementDate, termYears, jurisdiction, ipAddress }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const formattedDate = formatDate(agreementDate);

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

    const sections = getNdaSections(termYears, jurisdiction);

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

    doc.end();
  });
}

module.exports = { getClientIp, generateNdaPdf };
