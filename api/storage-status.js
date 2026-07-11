module.exports = async (req, res) => {
  const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

  return res.status(200).json({
    blobConfigured,
    message: blobConfigured
      ? 'Blob storage is connected. Signed NDAs save to ndas/{date}/ in your Blob store.'
      : 'Blob storage is NOT connected. Link your ai-blob store to the ai project in Vercel → Storage.',
    storePath: 'ndas/{agreement-date}/{name}_{timestamp}.pdf',
    dashboard: 'https://vercel.com/xaanies-projects/ai/stores',
  });
};
