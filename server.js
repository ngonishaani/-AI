const express = require('express');
const path = require('path');
const { getClientIp, generateNdaPdf } = require('./lib/nda-pdf');
const { sendNdaCopy } = require('./lib/send-nda-email');
const { storeNdaBlob } = require('./lib/store-nda-blob');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

    await Promise.all([
      sendNdaCopy({
        teamMemberName: teamMemberName.trim(),
        agreementDate,
        ipAddress,
        pdfBuffer,
        filename,
      }),
      storeNdaBlob({
        teamMemberName: teamMemberName.trim(),
        agreementDate,
        ipAddress,
        pdfBuffer,
        filename,
      }),
    ]);

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
