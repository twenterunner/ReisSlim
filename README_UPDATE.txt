ReisSlim v1.4.6 / Build 1406

ROOT CAUSE OF THE PREVIOUS 'NOT UPDATING' REPORT
------------------------------------------------
The GitHub main branch was checked after the v1.4.5 ZIP was supplied:
- config.js was still v1.4.4 / Build 1404
- README_UPDATE.txt was still v1.4.4
- README.md was still the old v1.0 multimodal documentation

Therefore the v1.4.5 files had not actually replaced the files in `main`.

There was also a packaging mistake: previous packages updated
README_UPDATE.txt, but the GitHub repository landing page displays README.md.
v1.4.6 includes and replaces the real README.md.

HOW TO UPDATE
-------------
1. Extract this ZIP first.
2. In GitHub, open the branch that actually deploys the site.
3. Upload the EXTRACTED FILES, not the ZIP itself.
4. Choose replace/overwrite for files with the same names.
5. Commit the upload.
6. Confirm in GitHub itself that config.js begins with:
      VERSION = '1.4.6'
      BUILD = '1406'
   and README.md starts with:
      # ReisSlim v1.4.6
7. Only then refresh the GitHub Pages app.

This ZIP contains files at root level, with no enclosing folder.
