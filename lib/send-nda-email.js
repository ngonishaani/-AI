const { Resend } = require('resend');

async function sendNdaCopy({ teamMemberName, agreementDate, ipAddress, pdfBuffer, filename }) {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NDA_NOTIFY_EMAIL;

  if (!apiKey || !notifyEmail) {
    console.warn('NDA email not sent: RESEND_API_KEY or NDA_NOTIFY_EMAIL not configured.');
    return { sent: false, reason: 'not_configured' };
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || 'ZimEdu NDA <onboarding@resend.dev>';

  const { error } = await resend.emails.send({
    from,
    to: [notifyEmail],
    subject: `Signed NDA: ${teamMemberName}`,
    html: `
      <p><strong>${teamMemberName}</strong> has signed the ZimEdu Mutual Non-Disclosure Agreement.</p>
      <p>Agreement date: ${agreementDate}<br>IP address: ${ipAddress}</p>
      <p>The signed PDF is attached.</p>
    `,
    attachments: [
      {
        filename,
        content: pdfBuffer,
      },
    ],
  });

  if (error) {
    console.error('NDA email error:', error);
    return { sent: false, reason: error.message };
  }

  return { sent: true };
}

module.exports = { sendNdaCopy };
