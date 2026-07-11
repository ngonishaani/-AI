const { put } = require('@vercel/blob');

function getBlobAuthStatus() {
  const hasReadWriteToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const hasStoreId = Boolean(process.env.BLOB_STORE_ID);
  const hasOidcToken = Boolean(process.env.VERCEL_OIDC_TOKEN);

  const configured = hasReadWriteToken || hasStoreId;

  let authMethod = 'none';
  if (hasReadWriteToken) authMethod = 'read_write_token';
  else if (hasStoreId) authMethod = 'oidc';

  return { configured, authMethod, hasReadWriteToken, hasStoreId, hasOidcToken };
}

async function storeNdaBlob({ teamMemberName, agreementDate, ipAddress, pdfBuffer, filename }) {
  const auth = getBlobAuthStatus();

  if (!auth.configured) {
    console.warn('NDA not stored in Blob: no Blob credentials found on this deployment.');
    return { stored: false, reason: 'not_configured' };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = teamMemberName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const pathname = `ndas/${agreementDate}/${safeName}_${timestamp}.pdf`;

  try {
    const blob = await put(pathname, pdfBuffer, {
      access: 'private',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    });

    return { stored: true, url: blob.url, pathname: blob.pathname, authMethod: auth.authMethod };
  } catch (err) {
    console.error('NDA Blob storage error:', err);
    return { stored: false, reason: err.message, authMethod: auth.authMethod };
  }
}

module.exports = { storeNdaBlob, getBlobAuthStatus };
