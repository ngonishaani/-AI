const { getClientIp, generateNdaPdf } = require('../lib/nda-pdf');
const { storeNdaBlob } = require('../lib/store-nda-blob');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { teamMemberName, agreementDate, termYears, jurisdiction } = req.body || {};

    if (!teamMemberName || !teamMemberName.trim()) {
      return res.status(400).json({ error: 'Team member name is required.' });
    }

    if (!agreementDate) {
      return res.status(400).json({ error: 'Agreement date is required.' });
    }

    const term = parseInt(termYears, 10) || 2;
    const juris = (jurisdiction || 'Zimbabwe').trim();
    const ipAddress = getClientIp(req);

    const pdfBuffer = await generateNdaPdf({
      teamMemberName: teamMemberName.trim(),
      agreementDate,
      termYears: term,
      jurisdiction: juris,
      ipAddress,
    });

    const safeName = teamMemberName.trim().replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `ZimEdu_NDA_${safeName}_${agreementDate}.pdf`;

    try {
      await storeNdaBlob({
        teamMemberName: teamMemberName.trim(),
        agreementDate,
        ipAddress,
        pdfBuffer,
        filename,
      });
    } catch (storeErr) {
      console.error('NDA Blob storage error:', storeErr);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    return res.status(500).json({ error: 'Failed to generate PDF. Please try again.' });
  }
};
