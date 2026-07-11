const { getBlobAuthStatus } = require('../lib/store-nda-blob');

module.exports = async (req, res) => {
  const auth = getBlobAuthStatus();

  return res.status(200).json({
    blobConfigured: auth.configured,
    authMethod: auth.authMethod,
    hasReadWriteToken: auth.hasReadWriteToken,
    hasStoreId: auth.hasStoreId,
    hasOidcToken: auth.hasOidcToken,
    message: auth.configured
      ? 'Blob storage is connected. Signed NDAs save to ndas/{date}/ in your Blob store.'
      : 'Blob storage is NOT connected. In Vercel → ai project → Storage, connect ai-blob and redeploy.',
    storePath: 'ndas/{agreement-date}/{name}_{timestamp}.pdf',
    dashboard: 'https://vercel.com/xaanies-projects/ai/stores',
  });
};
