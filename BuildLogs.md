# Build Logs - Des Moines Insider

## Latest Issues and Fixes (2025-09-02)

### Issue: Attractions Page Errors
- **Problem**: Service Worker registration failing, Attractions-DjQqithU.js returning 404
- **Cause**: Missing JavaScript chunk due to build cache/deployment issues, service worker registration failing on script evaluation
- **Solution Applied**:
  1. Rebuilt application to regenerate all chunks
  2. Made service worker registration more robust with error handling
  3. Added graceful asset caching (individual assets vs. batch)
  4. Added security context and script existence checks
  5. Deployed new build with hash `Attractions-Xs7jpw3R.js`

### Service Worker Improvements
- Individual asset caching to prevent complete failure if one asset fails
- Production-only registration with HTTPS requirement
- Script existence check before registration attempt
- Better error handling and logging

---

## Deployment Logs
2025-09-02T18:56:33.560976Z	Restoring from build output cache
2025-09-02T18:56:35.131132Z	Success: Dependencies restored from build cache.
2025-09-02T18:56:36.229658Z	Checking for configuration in a Wrangler configuration file (BETA)
2025-09-02T18:56:36.23033Z	
2025-09-02T18:56:37.348903Z	No wrangler.toml file found. Continuing.
2025-09-02T18:56:37.416107Z	Detected the following tools from environment: npm@10.9.2, nodejs@22.16.0
2025-09-02T18:56:37.416593Z	Installing project dependencies: npm clean-install --progress=false
2025-09-02T18:56:40.598056Z	npm warn deprecated @types/dompurify@3.2.0: This is a stub types definition. dompurify provides its own type definitions, so you do not need this installed.
2025-09-02T18:56:41.721259Z	npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
2025-09-02T18:56:45.736112Z	npm warn deprecated three-mesh-bvh@0.7.8: Deprecated due to three.js version incompatibility. Please use v0.8.0, instead.
2025-09-02T18:56:57.534114Z	
2025-09-02T18:56:57.534365Z	added 624 packages, and audited 625 packages in 20s
2025-09-02T18:56:57.534487Z	
2025-09-02T18:56:57.534559Z	87 packages are looking for funding
2025-09-02T18:56:57.534647Z	  run `npm fund` for details
2025-09-02T18:56:57.549858Z	
2025-09-02T18:56:57.550122Z	6 vulnerabilities (3 low, 3 moderate)
2025-09-02T18:56:57.550281Z	
2025-09-02T18:56:57.550356Z	To address all issues, run:
2025-09-02T18:56:57.550415Z	  npm audit fix
2025-09-02T18:56:57.550484Z	
2025-09-02T18:56:57.550543Z	Run `npm audit` for details.
2025-09-02T18:56:57.597964Z	Executing user command: npm run build
2025-09-02T18:56:57.983765Z	
2025-09-02T18:56:57.983997Z	> vite_react_shadcn_ts@0.0.0 build
2025-09-02T18:56:57.984673Z	> vite build
2025-09-02T18:56:57.985009Z	
2025-09-02T18:56:58.31378Z	[36mvite v5.4.10 [32mbuilding for production...[36m[39m
2025-09-02T18:56:58.624499Z	transforming...
2025-09-02T18:56:58.761876Z	Browserslist: browsers data (caniuse-lite) is 11 months old. Please run:
2025-09-02T18:56:58.762215Z	  npx update-browserslist-db@latest
2025-09-02T18:56:58.762417Z	  Why you should do it regularly: https://github.com/browserslist/update-db#readme
2025-09-02T18:57:11.946917Z	[32m✓[39m 4245 modules transformed.
2025-09-02T18:57:12.597743Z	rendering chunks...
2025-09-02T18:57:13.177792Z	computing gzip size...
2025-09-02T18:57:13.236193Z	[2mdist/[22m[32mindex.html                                   [39m[1m[2m 12.76 kB[22m[1m[22m[2m │ gzip:   3.28 kB[22m
2025-09-02T18:57:13.236605Z	[2mdist/[22m[2massets/[22m[35mleaflet-Dgihpmma.css                  [39m[1m[2m 15.04 kB[22m[1m[22m[2m │ gzip:   6.38 kB[22m
2025-09-02T18:57:13.236811Z	[2mdist/[22m[2massets/[22m[35mindex-DRRbDEic.css                    [39m[1m[2m121.86 kB[22m[1m[22m[2m │ gzip:  19.10 kB[22m
2025-09-02T18:57:13.236934Z	[2mdist/[22m[2massets/[22m[36mindex-D-oNyWyY.js                     [39m[1m[2m  0.14 kB[22m[1m[22m[2m │ gzip:   0.14 kB[22m
2025-09-02T18:57:13.237089Z	[2mdist/[22m[2massets/[22m[36mskeleton-D0z4rEK6.js                  [39m[1m[2m  0.17 kB[22m[1m[22m[2m │ gzip:   0.16 kB[22m
2025-09-02T18:57:13.237268Z	[2mdist/[22m[2massets/[22m[36mindex-BBXfmzHv.js                     [39m[1m[2m  0.23 kB[22m[1m[22m[2m │ gzip:   0.17 kB[22m
2025-09-02T18:57:13.237482Z	[2mdist/[22m[2massets/[22m[36mchevron-right-BupWgcW0.js             [39m[1m[2m  0.30 kB[22m[1m[22m[2m │ gzip:   0.25 kB[22m
2025-09-02T18:57:13.237559Z	[2mdist/[22m[2massets/[22m[36mloader-circle-c7wvdmUM.js             [39m[1m[2m  0.31 kB[22m[1m[22m[2m │ gzip:   0.26 kB[22m
2025-09-02T18:57:13.237762Z	[2mdist/[22m[2massets/[22m[36mmessage-circle-DvHif6rs.js            [39m[1m[2m  0.32 kB[22m[1m[22m[2m │ gzip:   0.26 kB[22m
2025-09-02T18:57:13.237943Z	[2mdist/[22m[2massets/[22m[36mnavigation-DhZn8Mgm.js                [39m[1m[2m  0.32 kB[22m[1m[22m[2m │ gzip:   0.26 kB[22m
2025-09-02T18:57:13.238101Z	[2mdist/[22m[2massets/[22m[36mfilter-LAeR6ASA.js                    [39m[1m[2m  0.33 kB[22m[1m[22m[2m │ gzip:   0.26 kB[22m
2025-09-02T18:57:13.238284Z	[2mdist/[22m[2massets/[22m[36mbookmark-COboIlaU.js                  [39m[1m[2m  0.33 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
2025-09-02T18:57:13.238439Z	[2mdist/[22m[2massets/[22m[36marrow-left-CBe4qK80.js                [39m[1m[2m  0.33 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
2025-09-02T18:57:13.238556Z	[2mdist/[22m[2massets/[22m[36marrow-right-C734a6Pn.js               [39m[1m[2m  0.33 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
2025-09-02T18:57:13.238957Z	[2mdist/[22m[2massets/[22m[36msearch-Dh4tbA5_.js                    [39m[1m[2m  0.34 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
2025-09-02T18:57:13.239506Z	[2mdist/[22m[2massets/[22m[36mmessage-square-BO24u70t.js            [39m[1m[2m  0.35 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
2025-09-02T18:57:13.23967Z	[2mdist/[22m[2massets/[22m[36mclock-C5vEiC7E.js                     [39m[1m[2m  0.35 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
2025-09-02T18:57:13.239856Z	[2mdist/[22m[2massets/[22m[36mmegaphone-CHwV54xn.js                 [39m[1m[2m  0.36 kB[22m[1m[22m[2m │ gzip:   0.28 kB[22m
2025-09-02T18:57:13.239965Z	[2mdist/[22m[2massets/[22m[36muser-CR0zIG-M.js                      [39m[1m[2m  0.37 kB[22m[1m[22m[2m │ gzip:   0.29 kB[22m
2025-09-02T18:57:13.240074Z	[2mdist/[22m[2massets/[22m[36minfo-gYd_W7jh.js                      [39m[1m[2m  0.37 kB[22m[1m[22m[2m │ gzip:   0.28 kB[22m
2025-09-02T18:57:13.240203Z	[2mdist/[22m[2massets/[22m[36mtrending-up-z_kxFFHv.js               [39m[1m[2m  0.37 kB[22m[1m[22m[2m │ gzip:   0.28 kB[22m
2025-09-02T18:57:13.240314Z	[2mdist/[22m[2massets/[22m[36mlock-DCRDrbb7.js                      [39m[1m[2m  0.38 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
2025-09-02T18:57:13.240423Z	[2mdist/[22m[2massets/[22m[36mmail-Dtn1S6eF.js                      [39m[1m[2m  0.38 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
2025-09-02T18:57:13.240527Z	[2mdist/[22m[2massets/[22m[36mdollar-sign-BfxXYPHm.js               [39m[1m[2m  0.39 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
2025-09-02T18:57:13.240628Z	[2mdist/[22m[2massets/[22m[36mflag-m5i9tZRa.js                      [39m[1m[2m  0.39 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
2025-09-02T18:57:13.240781Z	[2mdist/[22m[2massets/[22m[36mtarget-C8Evmq33.js                    [39m[1m[2m  0.40 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
2025-09-02T18:57:13.2409Z	[2mdist/[22m[2massets/[22m[36mcopy-DAEMQ2uI.js                      [39m[1m[2m  0.41 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
2025-09-02T18:57:13.241016Z	[2mdist/[22m[2massets/[22m[36mglobe-rUGXkFxA.js                     [39m[1m[2m  0.41 kB[22m[1m[22m[2m │ gzip:   0.29 kB[22m
2025-09-02T18:57:13.24113Z	[2mdist/[22m[2massets/[22m[36mcamera-BRWrm_oy.js                    [39m[1m[2m  0.42 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
2025-09-02T18:57:13.241235Z	[2mdist/[22m[2massets/[22m[36mexternal-link-CUmGZK10.js             [39m[1m[2m  0.42 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
2025-09-02T18:57:13.241338Z	[2mdist/[22m[2massets/[22m[36muser-check-QDiwhO_e.js                [39m[1m[2m  0.42 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
2025-09-02T18:57:13.241439Z	[2mdist/[22m[2massets/[22m[36meye-D-MQW4IP.js                       [39m[1m[2m  0.43 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
2025-09-02T18:57:13.241508Z	[2mdist/[22m[2massets/[22m[36mcalendar-CaV0k0mY.js                  [39m[1m[2m  0.43 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
2025-09-02T18:57:13.241581Z	[2mdist/[22m[2massets/[22m[36mmap-pin-CIM58DcH.js                   [39m[1m[2m  0.43 kB[22m[1m[22m[2m │ gzip:   0.33 kB[22m
2025-09-02T18:57:13.241667Z	[2mdist/[22m[2massets/[22m[36mlog-in-cmOya83I.js                    [39m[1m[2m  0.43 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
2025-09-02T18:57:13.241747Z	[2mdist/[22m[2massets/[22m[36mutensils-BxygC0J2.js                  [39m[1m[2m  0.43 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
2025-09-02T18:57:13.241841Z	[2mdist/[22m[2massets/[22m[36mzap-BctcJNXA.js                       [39m[1m[2m  0.43 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
2025-09-02T18:57:13.241935Z	[2mdist/[22m[2massets/[22m[36maward-C7SSlg72.js                     [39m[1m[2m  0.44 kB[22m[1m[22m[2m │ gzip:   0.33 kB[22m
2025-09-02T18:57:13.242037Z	[2mdist/[22m[2massets/[22m[36mbook-open-B7oMWAMf.js                 [39m[1m[2m  0.45 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
2025-09-02T18:57:13.242131Z	[2mdist/[22m[2massets/[22m[36msend-BeyAVxsI.js                      [39m[1m[2m  0.46 kB[22m[1m[22m[2m │ gzip:   0.33 kB[22m
2025-09-02T18:57:13.242228Z	[2mdist/[22m[2massets/[22m[36mgrid-3x3-CT3C4U_A.js                  [39m[1m[2m  0.46 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
2025-09-02T18:57:13.242313Z	[2mdist/[22m[2massets/[22m[36mlist-DpBOvP4J.js                      [39m[1m[2m  0.47 kB[22m[1m[22m[2m │ gzip:   0.29 kB[22m
2025-09-02T18:57:13.242395Z	[2mdist/[22m[2massets/[22m[36musers-CFxivo6F.js                     [39m[1m[2m  0.47 kB[22m[1m[22m[2m │ gzip:   0.33 kB[22m
2025-09-02T18:57:13.242477Z	[2mdist/[22m[2massets/[22m[36muser-plus-B-o-S4jf.js                 [39m[1m[2m  0.48 kB[22m[1m[22m[2m │ gzip:   0.34 kB[22m
2025-09-02T18:57:13.242623Z	[2mdist/[22m[2massets/[22m[36mtextarea-DuCwod9B.js                  [39m[1m[2m  0.48 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
2025-09-02T18:57:13.242733Z	[2mdist/[22m[2massets/[22m[36msquare-pen-Do5qUylK.js                [39m[1m[2m  0.49 kB[22m[1m[22m[2m │ gzip:   0.34 kB[22m
2025-09-02T18:57:13.242833Z	[2mdist/[22m[2massets/[22m[36mtag-BZ2rdaAZ.js                       [39m[1m[2m  0.50 kB[22m[1m[22m[2m │ gzip:   0.35 kB[22m
2025-09-02T18:57:13.242943Z	[2mdist/[22m[2massets/[22m[36msave-CvHnNAjd.js                      [39m[1m[2m  0.50 kB[22m[1m[22m[2m │ gzip:   0.33 kB[22m
2025-09-02T18:57:13.243056Z	[2mdist/[22m[2massets/[22m[36mfile-text-B9X1CETH.js                 [39m[1m[2m  0.50 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
2025-09-02T18:57:13.243164Z	[2mdist/[22m[2massets/[22m[36mshare-2-BjXOb73l.js                   [39m[1m[2m  0.53 kB[22m[1m[22m[2m │ gzip:   0.34 kB[22m
2025-09-02T18:57:13.243257Z	[2mdist/[22m[2massets/[22m[36mtrash-2-D-LQu42R.js                   [39m[1m[2m  0.53 kB[22m[1m[22m[2m │ gzip:   0.35 kB[22m
2025-09-02T18:57:13.243353Z	[2mdist/[22m[2massets/[22m[36mchevron-up-BbngR6dG.js                [39m[1m[2m  0.54 kB[22m[1m[22m[2m │ gzip:   0.28 kB[22m
2025-09-02T18:57:13.243444Z	[2mdist/[22m[2massets/[22m[36mlabel-D-ROFuRv.js                     [39m[1m[2m  0.55 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
2025-09-02T18:57:13.243539Z	[2mdist/[22m[2massets/[22m[36mphone-CP6d9HM_.js                     [39m[1m[2m  0.56 kB[22m[1m[22m[2m │ gzip:   0.36 kB[22m
2025-09-02T18:57:13.243662Z	[2mdist/[22m[2massets/[22m[36mendOfMonth-DlnO50rZ.js                [39m[1m[2m  0.57 kB[22m[1m[22m[2m │ gzip:   0.38 kB[22m
2025-09-02T18:57:13.243754Z	[2mdist/[22m[2massets/[22m[36minput-BRi9oLLj.js                     [39m[1m[2m  0.58 kB[22m[1m[22m[2m │ gzip:   0.35 kB[22m
2025-09-02T18:57:13.243866Z	[2mdist/[22m[2massets/[22m[36mmap-DQ-Sa5UB.js                       [39m[1m[2m  0.59 kB[22m[1m[22m[2m │ gzip:   0.38 kB[22m
2025-09-02T18:57:13.243959Z	[2mdist/[22m[2massets/[22m[36mstar-CXRr2z5l.js                      [39m[1m[2m  0.64 kB[22m[1m[22m[2m │ gzip:   0.40 kB[22m
2025-09-02T18:57:13.244061Z	[2mdist/[22m[2massets/[22m[36mcalendar-days-DCbPJzb0.js             [39m[1m[2m  0.66 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
2025-09-02T18:57:13.244155Z	[2mdist/[22m[2massets/[22m[36mseparator-vS7bu068.js                 [39m[1m[2m  0.67 kB[22m[1m[22m[2m │ gzip:   0.40 kB[22m
2025-09-02T18:57:13.244241Z	[2mdist/[22m[2massets/[22m[36mnavigation-2-Ckm6_Ok0.js              [39m[1m[2m  0.67 kB[22m[1m[22m[2m │ gzip:   0.33 kB[22m
2025-09-02T18:57:13.244334Z	[2mdist/[22m[2massets/[22m[36msparkles-DcwAe0iV.js                  [39m[1m[2m  0.68 kB[22m[1m[22m[2m │ gzip:   0.40 kB[22m
2025-09-02T18:57:13.244584Z	[2mdist/[22m[2massets/[22m[36mcircle-x-DTJYXaM8.js                  [39m[1m[2m  0.68 kB[22m[1m[22m[2m │ gzip:   0.35 kB[22m
2025-09-02T18:57:13.244708Z	[2mdist/[22m[2massets/[22m[36mpalette-D4v8kHXo.js                   [39m[1m[2m  0.78 kB[22m[1m[22m[2m │ gzip:   0.45 kB[22m
2025-09-02T18:57:13.244823Z	[2mdist/[22m[2massets/[22m[36mmusic-CMvNB3c3.js                     [39m[1m[2m  0.81 kB[22m[1m[22m[2m │ gzip:   0.39 kB[22m
2025-09-02T18:57:13.244946Z	[2mdist/[22m[2massets/[22m[36mmouse-pointer-CkgqzSSt.js             [39m[1m[2m  0.84 kB[22m[1m[22m[2m │ gzip:   0.43 kB[22m
2025-09-02T18:57:13.24506Z	[2mdist/[22m[2massets/[22m[36mupload-QZ50db9R.js                    [39m[1m[2m  0.85 kB[22m[1m[22m[2m │ gzip:   0.44 kB[22m
2025-09-02T18:57:13.245167Z	[2mdist/[22m[2massets/[22m[36msettings-CtZ4zv-2.js                  [39m[1m[2m  0.89 kB[22m[1m[22m[2m │ gzip:   0.45 kB[22m
2025-09-02T18:57:13.245267Z	[2mdist/[22m[2massets/[22m[36malert-BPsRxzx7.js                     [39m[1m[2m  0.91 kB[22m[1m[22m[2m │ gzip:   0.46 kB[22m
2025-09-02T18:57:13.245372Z	[2mdist/[22m[2massets/[22m[36mbadge-yq4flZky.js                     [39m[1m[2m  0.98 kB[22m[1m[22m[2m │ gzip:   0.54 kB[22m
2025-09-02T18:57:13.245467Z	[2mdist/[22m[2massets/[22m[36mtwitter-PMf8IeqC.js                   [39m[1m[2m  1.13 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
2025-09-02T18:57:13.245566Z	[2mdist/[22m[2massets/[22m[36mreply-CWVIwAyX.js                     [39m[1m[2m  1.15 kB[22m[1m[22m[2m │ gzip:   0.48 kB[22m
2025-09-02T18:57:13.246523Z	[2mdist/[22m[2massets/[22m[36mheart-D75ZNIOe.js                     [39m[1m[2m  1.15 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m
2025-09-02T18:57:13.246623Z	[2mdist/[22m[2massets/[22m[36msliders-horizontal-Co1zs0DT.js        [39m[1m[2m  1.18 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
2025-09-02T18:57:13.246805Z	[2mdist/[22m[2massets/[22m[36mshield-DRhtXSyV.js                    [39m[1m[2m  1.18 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
2025-09-02T18:57:13.247402Z	[2mdist/[22m[2massets/[22m[36merrorSuppression-C_Wr2-52.js          [39m[1m[2m  1.22 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
2025-09-02T18:57:13.24754Z	[2mdist/[22m[2massets/[22m[36mperformance-B14TXic8.js               [39m[1m[2m  1.23 kB[22m[1m[22m[2m │ gzip:   0.62 kB[22m
2025-09-02T18:57:13.247657Z	[2mdist/[22m[2massets/[22m[36museProfile-ZYILKTsR.js                [39m[1m[2m  1.25 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
2025-09-02T18:57:13.24821Z	[2mdist/[22m[2massets/[22m[36mAIWriteup-9Imcy0Er.js                 [39m[1m[2m  1.34 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
2025-09-02T18:57:13.248324Z	[2mdist/[22m[2massets/[22m[36musePlaygrounds-BRp_j7we.js            [39m[1m[2m  1.53 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m
2025-09-02T18:57:13.248622Z	[2mdist/[22m[2massets/[22m[36museUserSubmittedEvents-D2Kiv7S4.js    [39m[1m[2m  1.63 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m
2025-09-02T18:57:13.249072Z	[2mdist/[22m[2massets/[22m[36museAttractions-DvhFT9yx.js            [39m[1m[2m  1.64 kB[22m[1m[22m[2m │ gzip:   0.71 kB[22m
2025-09-02T18:57:13.249213Z	[2mdist/[22m[2massets/[22m[36mtree-pine-DyqDxM9n.js                 [39m[1m[2m  1.82 kB[22m[1m[22m[2m │ gzip:   0.68 kB[22m
2025-09-02T18:57:13.249326Z	[2mdist/[22m[2massets/[22m[36museAuth-DL9aJ1nd.js                   [39m[1m[2m  1.90 kB[22m[1m[22m[2m │ gzip:   0.85 kB[22m
2025-09-02T18:57:13.24942Z	[2mdist/[22m[2massets/[22m[36mNotFound-Dg_xIIpd.js                  [39m[1m[2m  1.94 kB[22m[1m[22m[2m │ gzip:   0.89 kB[22m
2025-09-02T18:57:13.250064Z	[2mdist/[22m[2massets/[22m[36museEvents-DE1-3tsr.js                 [39m[1m[2m  1.95 kB[22m[1m[22m[2m │ gzip:   0.86 kB[22m
2025-09-02T18:57:13.250166Z	[2mdist/[22m[2massets/[22m[36museSupabase-CUlj9tzC.js               [39m[1m[2m  1.97 kB[22m[1m[22m[2m │ gzip:   0.86 kB[22m
2025-09-02T18:57:13.25073Z	[2mdist/[22m[2massets/[22m[36mloading-skeleton-HN-z-0KK.js          [39m[1m[2m  2.07 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
2025-09-02T18:57:13.250827Z	[2mdist/[22m[2massets/[22m[36mdialog-Lc3HGRhz.js                    [39m[1m[2m  2.17 kB[22m[1m[22m[2m │ gzip:   0.84 kB[22m
2025-09-02T18:57:13.250925Z	[2mdist/[22m[2massets/[22m[36museCampaigns-C9xTdKyD.js              [39m[1m[2m  2.24 kB[22m[1m[22m[2m │ gzip:   0.88 kB[22m
2025-09-02T18:57:13.251363Z	[2mdist/[22m[2massets/[22m[36museSocialFeatures-CaorZyH8.js         [39m[1m[2m  2.27 kB[22m[1m[22m[2m │ gzip:   0.84 kB[22m
2025-09-02T18:57:13.251464Z	[2mdist/[22m[2massets/[22m[36mswitch-DDub4ZDc.js                    [39m[1m[2m  2.37 kB[22m[1m[22m[2m │ gzip:   1.20 kB[22m
2025-09-02T18:57:13.251558Z	[2mdist/[22m[2massets/[22m[36mparseISO--S5N9GAi.js                  [39m[1m[2m  2.67 kB[22m[1m[22m[2m │ gzip:   1.18 kB[22m
2025-09-02T18:57:13.252101Z	[2mdist/[22m[2massets/[22m[36mcheckbox-DlcCRrKV.js                  [39m[1m[2m  2.82 kB[22m[1m[22m[2m │ gzip:   1.39 kB[22m
2025-09-02T18:57:13.252212Z	[2mdist/[22m[2massets/[22m[36museMutation-CZrroXMu.js               [39m[1m[2m  2.91 kB[22m[1m[22m[2m │ gzip:   1.23 kB[22m
2025-09-02T18:57:13.252488Z	[2mdist/[22m[2massets/[22m[36mformatDistanceToNow-DFNnbIIc.js       [39m[1m[2m  3.08 kB[22m[1m[22m[2m │ gzip:   1.33 kB[22m
2025-09-02T18:57:13.252558Z	[2mdist/[22m[2massets/[22m[36museRestaurants-DWL8NW6H.js            [39m[1m[2m  3.26 kB[22m[1m[22m[2m │ gzip:   1.16 kB[22m
2025-09-02T18:57:13.252808Z	[2mdist/[22m[2massets/[22m[36mtabs-Bbzz1YdL.js                      [39m[1m[2m  3.27 kB[22m[1m[22m[2m │ gzip:   1.37 kB[22m
2025-09-02T18:57:13.252887Z	[2mdist/[22m[2massets/[22m[36museArticles-DbSx99W5.js               [39m[1m[2m  3.45 kB[22m[1m[22m[2m │ gzip:   1.13 kB[22m
2025-09-02T18:57:13.252949Z	[2mdist/[22m[2massets/[22m[36mEventPhotoUpload-CXsPvz5R.js          [39m[1m[2m  3.59 kB[22m[1m[22m[2m │ gzip:   1.62 kB[22m
2025-09-02T18:57:13.253022Z	[2mdist/[22m[2massets/[22m[36mCampaignDashboard-_gyYrOFL.js         [39m[1m[2m  3.83 kB[22m[1m[22m[2m │ gzip:   1.27 kB[22m
2025-09-02T18:57:13.253079Z	[2mdist/[22m[2massets/[22m[36mindex-ClxaBHZ8.js                     [39m[1m[2m  4.39 kB[22m[1m[22m[2m │ gzip:   1.94 kB[22m
2025-09-02T18:57:13.25314Z	[2mdist/[22m[2massets/[22m[36mSEOHead-CLH59y9q.js                   [39m[1m[2m  4.55 kB[22m[1m[22m[2m │ gzip:   1.49 kB[22m
2025-09-02T18:57:13.253197Z	[2mdist/[22m[2massets/[22m[36malert-dialog-DVtZp9-c.js              [39m[1m[2m  4.75 kB[22m[1m[22m[2m │ gzip:   1.74 kB[22m
2025-09-02T18:57:13.253259Z	[2mdist/[22m[2massets/[22m[36mLocalSEO-BIZ1wClZ.js                  [39m[1m[2m  4.97 kB[22m[1m[22m[2m │ gzip:   1.59 kB[22m
2025-09-02T18:57:13.253319Z	[2mdist/[22m[2massets/[22m[36museCommunityFeatures-CSRKMulN.js      [39m[1m[2m  5.13 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
2025-09-02T18:57:13.253374Z	[2mdist/[22m[2massets/[22m[36mindex-q6WwxjhC.js                     [39m[1m[2m  5.20 kB[22m[1m[22m[2m │ gzip:   1.98 kB[22m
2025-09-02T18:57:13.253429Z	[2mdist/[22m[2massets/[22m[36mpopover-BCHzftBR.js                   [39m[1m[2m  5.26 kB[22m[1m[22m[2m │ gzip:   1.91 kB[22m
2025-09-02T18:57:13.253484Z	[2mdist/[22m[2massets/[22m[36mShareDialog-CdcQiy5s.js               [39m[1m[2m  5.31 kB[22m[1m[22m[2m │ gzip:   2.55 kB[22m
2025-09-02T18:57:13.253538Z	[2mdist/[22m[2massets/[22m[36mWeekendPage-CmDFyElV.js               [39m[1m[2m  5.90 kB[22m[1m[22m[2m │ gzip:   2.28 kB[22m
2025-09-02T18:57:13.2536Z	[2mdist/[22m[2massets/[22m[36mweb-vitals-9hSwZ9_H.js                [39m[1m[2m  6.23 kB[22m[1m[22m[2m │ gzip:   2.54 kB[22m
2025-09-02T18:57:13.253686Z	[2mdist/[22m[2massets/[22m[36mAttractionDetails-CuVUcIeY.js         [39m[1m[2m  6.59 kB[22m[1m[22m[2m │ gzip:   2.40 kB[22m
2025-09-02T18:57:13.253748Z	[2mdist/[22m[2massets/[22m[36mPlaygroundDetails-D-kgcpJF.js         [39m[1m[2m  6.97 kB[22m[1m[22m[2m │ gzip:   2.32 kB[22m
2025-09-02T18:57:13.253959Z	[2mdist/[22m[2massets/[22m[36men-US-DOJyapGV.js                     [39m[1m[2m  7.73 kB[22m[1m[22m[2m │ gzip:   2.71 kB[22m
2025-09-02T18:57:13.254058Z	[2mdist/[22m[2massets/[22m[36mAuth-BoL-qZxi.js                      [39m[1m[2m  7.89 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
2025-09-02T18:57:13.255564Z	[2mdist/[22m[2massets/[22m[36mNeighborhoodsPage-DFj45oXP.js         [39m[1m[2m  7.98 kB[22m[1m[22m[2m │ gzip:   2.60 kB[22m
2025-09-02T18:57:13.255925Z	[2mdist/[22m[2massets/[22m[36mArticleDetails-Bv2AoDqf.js            [39m[1m[2m  8.00 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
2025-09-02T18:57:13.256023Z	[2mdist/[22m[2massets/[22m[36mslider-CDjfaIQI.js                    [39m[1m[2m  8.23 kB[22m[1m[22m[2m │ gzip:   3.33 kB[22m
2025-09-02T18:57:13.256171Z	[2mdist/[22m[2massets/[22m[36mAttractions-DjQqithU.js               [39m[1m[2m  8.79 kB[22m[1m[22m[2m │ gzip:   3.04 kB[22m
2025-09-02T18:57:13.256299Z	[2mdist/[22m[2massets/[22m[36mAdminArticleEditor-BEUTAnJA.js        [39m[1m[2m  9.70 kB[22m[1m[22m[2m │ gzip:   3.11 kB[22m
2025-09-02T18:57:13.256568Z	[2mdist/[22m[2massets/[22m[36mArticles-CY9YHV0v.js                  [39m[1m[2m 10.15 kB[22m[1m[22m[2m │ gzip:   3.34 kB[22m
2025-09-02T18:57:13.256909Z	[2mdist/[22m[2massets/[22m[36mNeighborhoodPage-BhZYwaAW.js          [39m[1m[2m 10.17 kB[22m[1m[22m[2m │ gzip:   3.03 kB[22m
2025-09-02T18:57:13.257019Z	[2mdist/[22m[2massets/[22m[36museQuery-B1xprQu3.js                  [39m[1m[2m 10.35 kB[22m[1m[22m[2m │ gzip:   3.65 kB[22m
2025-09-02T18:57:13.257263Z	[2mdist/[22m[2massets/[22m[36mtimezone-nzrCU0L8.js                  [39m[1m[2m 10.49 kB[22m[1m[22m[2m │ gzip:   3.77 kB[22m
2025-09-02T18:57:13.257391Z	[2mdist/[22m[2massets/[22m[36mPlaygrounds-DA37RLWG.js               [39m[1m[2m 10.96 kB[22m[1m[22m[2m │ gzip:   3.73 kB[22m
2025-09-02T18:57:13.257596Z	[2mdist/[22m[2massets/[22m[36mRestaurantsPage-BUWJQbCU.js           [39m[1m[2m 11.06 kB[22m[1m[22m[2m │ gzip:   3.66 kB[22m
2025-09-02T18:57:13.258237Z	[2mdist/[22m[2massets/[22m[36mSmartCalendarIntegration-CGJEMWzd.js  [39m[1m[2m 11.72 kB[22m[1m[22m[2m │ gzip:   3.40 kB[22m
2025-09-02T18:57:13.258335Z	[2mdist/[22m[2massets/[22m[36mProfile-DOXjr1Z_.js                   [39m[1m[2m 12.04 kB[22m[1m[22m[2m │ gzip:   3.45 kB[22m
2025-09-02T18:57:13.258396Z	[2mdist/[22m[2massets/[22m[36mformat-D61ASm2I.js                    [39m[1m[2m 13.06 kB[22m[1m[22m[2m │ gzip:   3.48 kB[22m
2025-09-02T18:57:13.258731Z	[2mdist/[22m[2massets/[22m[36mprogress-B5JwrGeK.js                  [39m[1m[2m 14.81 kB[22m[1m[22m[2m │ gzip:   3.99 kB[22m
2025-09-02T18:57:13.258817Z	[2mdist/[22m[2massets/[22m[36museEventSocial-1F_9XQR4.js            [39m[1m[2m 15.03 kB[22m[1m[22m[2m │ gzip:   4.46 kB[22m
2025-09-02T18:57:13.258876Z	[2mdist/[22m[2massets/[22m[36mRestaurantDetails-B7WIDwn5.js         [39m[1m[2m 15.72 kB[22m[1m[22m[2m │ gzip:   4.38 kB[22m
2025-09-02T18:57:13.259127Z	[2mdist/[22m[2massets/[22m[36mindex-D-zLZPO9.js                     [39m[1m[2m 16.81 kB[22m[1m[22m[2m │ gzip:   6.44 kB[22m
2025-09-02T18:57:13.259212Z	[2mdist/[22m[2massets/[22m[36mAdvertise-BHKIvwaz.js                 [39m[1m[2m 18.45 kB[22m[1m[22m[2m │ gzip:   4.88 kB[22m
2025-09-02T18:57:13.259278Z	[2mdist/[22m[2massets/[22m[36mRestaurants-B_TlTmUy.js               [39m[1m[2m 19.66 kB[22m[1m[22m[2m │ gzip:   5.60 kB[22m
2025-09-02T18:57:13.259338Z	[2mdist/[22m[2massets/[22m[36mEventsPage--c3K0Gur.js                [39m[1m[2m 19.82 kB[22m[1m[22m[2m │ gzip:   6.33 kB[22m
2025-09-02T18:57:13.259395Z	[2mdist/[22m[2massets/[22m[36mselect-CO_5X89C.js                    [39m[1m[2m 21.05 kB[22m[1m[22m[2m │ gzip:   7.31 kB[22m
2025-09-02T18:57:13.259451Z	[2mdist/[22m[2massets/[22m[36mSocial-25X9Lro9.js                    [39m[1m[2m 22.96 kB[22m[1m[22m[2m │ gzip:   5.45 kB[22m
2025-09-02T18:57:13.259507Z	[2mdist/[22m[2massets/[22m[36mAdvancedSearchPage-BlyiULPj.js        [39m[1m[2m 25.21 kB[22m[1m[22m[2m │ gzip:   6.85 kB[22m
2025-09-02T18:57:13.259568Z	[2mdist/[22m[2massets/[22m[36mBusinessPartnership-B1s7srNA.js       [39m[1m[2m 27.86 kB[22m[1m[22m[2m │ gzip:   6.40 kB[22m
2025-09-02T18:57:13.259625Z	[2mdist/[22m[2massets/[22m[36mEventDetails-DhVwyLgz.js              [39m[1m[2m 30.61 kB[22m[1m[22m[2m │ gzip:   8.33 kB[22m
2025-09-02T18:57:13.259766Z	[2mdist/[22m[2massets/[22m[36mcalendar-C6kDt2A9.js                  [39m[1m[2m 34.68 kB[22m[1m[22m[2m │ gzip:  10.96 kB[22m
2025-09-02T18:57:13.259855Z	[2mdist/[22m[2massets/[22m[36mUserDashboard-DUe4C7uu.js             [39m[1m[2m 37.57 kB[22m[1m[22m[2m │ gzip:  12.84 kB[22m
2025-09-02T18:57:13.259915Z	[2mdist/[22m[2massets/[22m[36mFooter-BwMeCwZo.js                    [39m[1m[2m 47.53 kB[22m[1m[22m[2m │ gzip:  13.49 kB[22m
2025-09-02T18:57:13.259971Z	[2mdist/[22m[2massets/[22m[36mclient-ByWcI_rx.js                    [39m[1m[2m117.58 kB[22m[1m[22m[2m │ gzip:  32.11 kB[22m
2025-09-02T18:57:13.260041Z	[2mdist/[22m[2massets/[22m[36mleaflet-pbFl6Snh.js                   [39m[1m[2m154.28 kB[22m[1m[22m[2m │ gzip:  45.10 kB[22m
2025-09-02T18:57:13.260099Z	[2mdist/[22m[2massets/[22m[36mindex-BTb_3pxb.js                     [39m[1m[2m339.33 kB[22m[1m[22m[2m │ gzip: 110.10 kB[22m
2025-09-02T18:57:13.260158Z	[2mdist/[22m[2massets/[22m[36mAdmin-iKwIFbGj.js                     [39m[1m[33m730.16 kB[39m[22m[2m │ gzip: 182.12 kB[22m
2025-09-02T18:57:13.260215Z	[2mdist/[22m[2massets/[22m[36mGamification-BrXJaR4E.js              [39m[1m[33m749.96 kB[39m[22m[2m │ gzip: 135.52 kB[22m
2025-09-02T18:57:13.260279Z	[2mdist/[22m[2massets/[22m[36mIndex-B4cTPQZ-.js                     [39m[1m[33m907.12 kB[39m[22m[2m │ gzip: 244.34 kB[22m
2025-09-02T18:57:13.260336Z	[32m✓ built in 14.90s[39m
2025-09-02T18:57:13.260418Z	[33m
2025-09-02T18:57:13.26072Z	(!) Some chunks are larger than 500 kB after minification. Consider:
2025-09-02T18:57:13.260843Z	- Using dynamic import() to code-split the application
2025-09-02T18:57:13.260953Z	- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
2025-09-02T18:57:13.261063Z	- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
2025-09-02T18:57:13.395476Z	Finished
2025-09-02T18:57:14.322793Z	Checking for configuration in a Wrangler configuration file (BETA)
2025-09-02T18:57:14.323409Z	
2025-09-02T18:57:15.433243Z	No wrangler.toml file found. Continuing.
2025-09-02T18:57:15.433926Z	Note: No functions dir at /functions found. Skipping.
2025-09-02T18:57:15.434049Z	Validating asset output directory
2025-09-02T18:57:18.263241Z	Deploying your site to Cloudflare's global network...
2025-09-02T18:57:19.330306Z	Parsed 12 valid redirect rules.
2025-09-02T18:57:19.330766Z	Found invalid redirect lines:
2025-09-02T18:57:19.330872Z	  - #2: /restaurants/* /index.html 200
2025-09-02T18:57:19.330944Z	    Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-09-02T18:57:19.331031Z	  - #3: /events/* /index.html 200
2025-09-02T18:57:19.331097Z	    Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-09-02T18:57:19.331155Z	  - #4: /playgrounds/* /index.html 200
2025-09-02T18:57:19.331217Z	    Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-09-02T18:57:19.331294Z	  - #5: /attractions/* /index.html 200
2025-09-02T18:57:19.331351Z	    Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-09-02T18:57:19.331435Z	  - #6: /neighborhoods/* /index.html 200
2025-09-02T18:57:19.331507Z	    Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-09-02T18:57:19.331573Z	  - #7: /articles/* /index.html 200
2025-09-02T18:57:19.331644Z	    Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-09-02T18:57:19.331743Z	  - #14: /admin/* /index.html 200
2025-09-02T18:57:19.331809Z	    Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-09-02T18:57:19.331865Z	Parsed 14 valid header rules.
2025-09-02T18:57:20.56662Z	Uploading... (173/173)
2025-09-02T18:57:20.567458Z	✨ Success! Uploaded 0 files (173 already uploaded) (0.30 sec)
2025-09-02T18:57:20.567686Z	
2025-09-02T18:57:21.632452Z	✨ Upload complete!
2025-09-02T18:57:24.1567Z	Skipping build output cache as it's not supported for your project
2025-09-02T18:57:25.91336Z	Success: Assets published!
2025-09-02T18:57:27.873781Z	Success: Your site was deployed!