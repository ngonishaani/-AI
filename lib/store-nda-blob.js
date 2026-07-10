const { put } = require('@vercel/blob');

async function storeNdaBlob({ teamMemberName, agreementDate, ipAddress, pdfBuffer, filename }) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    console.warn('NDA not stored in Blob: BLOB_READ_WRITE_TOKEN not configured.');
    return { stored: false, reason: 'not_configured' };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = teamMemberName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const pathname = `ndas/${agreementDate}/${safeName}_${timestamp}.pdf`;

  try {
    const blob = await put(pathname, pdfBuffer, {
      access: 'private',
      contentType: 'application/pdf',
      token,
      addRandomSuffix: false,
    });

    return { stored: true, url: blob.url, pathname: blob.pathname };
  } catch (err) {
    console.error('NDA Blob storage error:', err);
    return { stored: false, reason: err.message };
  }
}

module.exports = { storeNdaBlob };
