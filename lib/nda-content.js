function getNdaSections(termYears, jurisdiction) {
  return [
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
}

module.exports = { getNdaSections };
