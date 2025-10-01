2025-10-01T12:43:08.093719Z	Cloning repository...
2025-10-01T12:43:09.383683Z	From https://github.com/dj-pearson/desmoines-ai-pulse
2025-10-01T12:43:09.384239Z	 * branch            6babfd2b625f00371823dc6c79570a1a27dc8705 -> FETCH_HEAD
2025-10-01T12:43:09.384399Z	
2025-10-01T12:43:09.484638Z	HEAD is now at 6babfd2 FORCE CACHE CLEAR: Bump service worker and add cache version
2025-10-01T12:43:09.485276Z	
2025-10-01T12:43:09.562637Z	
2025-10-01T12:43:09.563378Z	Using v2 root directory strategy
2025-10-01T12:43:09.584825Z	Success: Finished cloning repository files
2025-10-01T12:43:10.384123Z	Restoring from dependencies cache
2025-10-01T12:43:10.400807Z	Restoring from build output cache
2025-10-01T12:43:11.597645Z	Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T12:43:11.59882Z	
2025-10-01T12:43:12.703504Z	No wrangler.toml file found. Continuing.
2025-10-01T12:43:12.781892Z	Detected the following tools from environment: nodejs@20.18.0, npm@10.9.2
2025-10-01T12:43:12.782454Z	Installing nodejs 20.18.0
2025-10-01T12:43:13.902535Z	Trying to update node-build... ok
2025-10-01T12:43:14.000811Z	To follow progress, use 'tail -f /tmp/node-build.20251001124313.496.log' or pass --verbose
2025-10-01T12:43:14.096328Z	Downloading node-v20.18.0-linux-x64.tar.gz...
2025-10-01T12:43:14.318425Z	-> https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz
2025-10-01T12:43:15.99388Z	
2025-10-01T12:43:15.994174Z	WARNING: node-v20.18.0-linux-x64 is in LTS Maintenance mode and nearing its end of life.
2025-10-01T12:43:15.994314Z	It only receives *critical* security updates, *critical* bug fixes and documentation updates.
2025-10-01T12:43:15.994435Z	
2025-10-01T12:43:15.994526Z	Installing node-v20.18.0-linux-x64...
2025-10-01T12:43:16.387077Z	Installed node-v20.18.0-linux-x64 to /opt/buildhome/.asdf/installs/nodejs/20.18.0
2025-10-01T12:43:16.387384Z	
2025-10-01T12:43:17.417686Z	Installing project dependencies: npm clean-install --progress=false
2025-10-01T12:43:23.452345Z	npm warn deprecated @types/dompurify@3.2.0: This is a stub types definition. dompurify provides its own type definitions, so you do not need this installed.
2025-10-01T12:43:24.013814Z	npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
2025-10-01T12:43:27.706979Z	npm warn deprecated three-mesh-bvh@0.7.8: Deprecated due to three.js version incompatibility. Please use v0.8.0, instead.
2025-10-01T12:43:47.425342Z	
2025-10-01T12:43:47.425714Z	added 695 packages, and audited 696 packages in 30s
2025-10-01T12:43:47.425898Z	
2025-10-01T12:43:47.426077Z	103 packages are looking for funding
2025-10-01T12:43:47.42627Z	  run `npm fund` for details
2025-10-01T12:43:47.445955Z	
2025-10-01T12:43:47.446244Z	6 vulnerabilities (3 low, 3 moderate)
2025-10-01T12:43:47.446389Z	
2025-10-01T12:43:47.446534Z	To address all issues, run:
2025-10-01T12:43:47.446721Z	  npm audit fix
2025-10-01T12:43:47.446873Z	
2025-10-01T12:43:47.447025Z	Run `npm audit` for details.
2025-10-01T12:43:47.470249Z	Executing user command: npm run build
2025-10-01T12:43:47.918182Z	
2025-10-01T12:43:47.9184Z	> vite_react_shadcn_ts@0.0.0 build
2025-10-01T12:43:47.918522Z	> vite build
2025-10-01T12:43:47.918593Z	
2025-10-01T12:43:48.221014Z	[36mvite v5.4.10 [32mbuilding for production...[36m[39m
2025-10-01T12:43:48.304072Z	transforming...
2025-10-01T12:44:05.497239Z	[32m✓[39m 4260 modules transformed.
2025-10-01T12:44:07.31335Z	rendering chunks...
2025-10-01T12:44:25.8096Z	computing gzip size...
2025-10-01T12:44:25.910029Z	[2mdist/[22m[32mindex.html                                   [39m[1m[2m   15.02 kB[22m[1m[22m[2m │ gzip:   4.05 kB[22m
2025-10-01T12:44:25.91037Z	[2mdist/[22m[2massets/[22m[35mvendor-other-Dgihpmma.css             [39m[1m[2m   15.04 kB[22m[1m[22m[2m │ gzip:   6.38 kB[22m
2025-10-01T12:44:25.910612Z	[2mdist/[22m[2massets/[22m[35mindex-IE542Gmw.css                    [39m[1m[2m  125.20 kB[22m[1m[22m[2m │ gzip:  19.50 kB[22m
2025-10-01T12:44:25.910733Z	[2mdist/[22m[2massets/[22m[36mvendor-ui-ByoYm48K.js                 [39m[1m[2m    0.25 kB[22m[1m[22m[2m │ gzip:   0.21 kB[22m[2m │ map:     1.25 kB[22m
2025-10-01T12:44:25.911067Z	[2mdist/[22m[2massets/[22m[36mskeleton-mGuZGEtJ.js                  [39m[1m[2m    0.26 kB[22m[1m[22m[2m │ gzip:   0.22 kB[22m[2m │ map:     0.55 kB[22m
2025-10-01T12:44:25.911408Z	[2mdist/[22m[2massets/[22m[36mseparator-Dae1tIj8.js                 [39m[1m[2m    0.42 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m[2m │ map:     1.29 kB[22m
2025-10-01T12:44:25.911548Z	[2mdist/[22m[2massets/[22m[36mlabel-DbpYWBHN.js                     [39m[1m[2m    0.42 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m[2m │ map:     1.17 kB[22m
2025-10-01T12:44:25.911702Z	[2mdist/[22m[2massets/[22m[36mclient-CuNO40hr.js                    [39m[1m[2m    0.44 kB[22m[1m[22m[2m │ gzip:   0.38 kB[22m[2m │ map:     1.14 kB[22m
2025-10-01T12:44:25.91183Z	[2mdist/[22m[2massets/[22m[36mprogress-DZNUXRMr.js                  [39m[1m[2m    0.48 kB[22m[1m[22m[2m │ gzip:   0.36 kB[22m[2m │ map:     1.38 kB[22m
2025-10-01T12:44:25.911967Z	[2mdist/[22m[2massets/[22m[36mtextarea-BziXp-7B.js                  [39m[1m[2m    0.57 kB[22m[1m[22m[2m │ gzip:   0.38 kB[22m[2m │ map:     1.13 kB[22m
2025-10-01T12:44:25.912081Z	[2mdist/[22m[2massets/[22m[36minput-e-4gUWzU.js                     [39m[1m[2m    0.66 kB[22m[1m[22m[2m │ gzip:   0.41 kB[22m[2m │ map:     1.16 kB[22m
2025-10-01T12:44:25.912229Z	[2mdist/[22m[2massets/[22m[36mcheckbox-Bq650Bpd.js                  [39m[1m[2m    0.72 kB[22m[1m[22m[2m │ gzip:   0.43 kB[22m[2m │ map:     1.63 kB[22m
2025-10-01T12:44:25.912478Z	[2mdist/[22m[2massets/[22m[36mslider-B3N1sq2i.js                    [39m[1m[2m    0.80 kB[22m[1m[22m[2m │ gzip:   0.47 kB[22m[2m │ map:     1.71 kB[22m
2025-10-01T12:44:25.91272Z	[2mdist/[22m[2massets/[22m[36mpopover-BBPRIcpx.js                   [39m[1m[2m    0.82 kB[22m[1m[22m[2m │ gzip:   0.45 kB[22m[2m │ map:     1.83 kB[22m
2025-10-01T12:44:25.91288Z	[2mdist/[22m[2massets/[22m[36mbadge-DZ0-1i3v.js                     [39m[1m[2m    0.83 kB[22m[1m[22m[2m │ gzip:   0.45 kB[22m[2m │ map:     1.70 kB[22m
2025-10-01T12:44:25.91302Z	[2mdist/[22m[2massets/[22m[36mswitch-Ds0ODq3k.js                    [39m[1m[2m    0.86 kB[22m[1m[22m[2m │ gzip:   0.48 kB[22m[2m │ map:     1.63 kB[22m
2025-10-01T12:44:25.913141Z	[2mdist/[22m[2massets/[22m[36malert-2sReonCP.js                     [39m[1m[2m    1.02 kB[22m[1m[22m[2m │ gzip:   0.54 kB[22m[2m │ map:     2.47 kB[22m
2025-10-01T12:44:25.913285Z	[2mdist/[22m[2massets/[22m[36merrorSuppression-LVnJe3hs.js          [39m[1m[2m    1.08 kB[22m[1m[22m[2m │ gzip:   0.55 kB[22m[2m │ map:     4.33 kB[22m
2025-10-01T12:44:25.913406Z	[2mdist/[22m[2massets/[22m[36museProfile-ar63XZr0.js                [39m[1m[2m    1.09 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m[2m │ map:     4.51 kB[22m
2025-10-01T12:44:25.913534Z	[2mdist/[22m[2massets/[22m[36mtabs-Do7v7h8b.js                      [39m[1m[2m    1.16 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m[2m │ map:     2.70 kB[22m
2025-10-01T12:44:25.913651Z	[2mdist/[22m[2massets/[22m[36mAIWriteup-Cz2Aju73.js                 [39m[1m[2m    1.35 kB[22m[1m[22m[2m │ gzip:   0.72 kB[22m[2m │ map:     3.15 kB[22m
2025-10-01T12:44:25.913776Z	[2mdist/[22m[2massets/[22m[36musePlaygrounds-CcQa7Amw.js            [39m[1m[2m    1.39 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m[2m │ map:     5.68 kB[22m
2025-10-01T12:44:25.913896Z	[2mdist/[22m[2massets/[22m[36museSocialFeatures-C6u7xR9M.js         [39m[1m[2m    1.48 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m[2m │ map:     9.52 kB[22m
2025-10-01T12:44:25.914009Z	[2mdist/[22m[2massets/[22m[36museAuth-QYBUzbbh.js                   [39m[1m[2m    1.49 kB[22m[1m[22m[2m │ gzip:   0.73 kB[22m[2m │ map:     6.23 kB[22m
2025-10-01T12:44:25.914137Z	[2mdist/[22m[2massets/[22m[36museAttractions-D1JZsT8f.js            [39m[1m[2m    1.50 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m[2m │ map:     6.15 kB[22m
2025-10-01T12:44:25.914286Z	[2mdist/[22m[2massets/[22m[36mFAQSection-C13Mv9Kx.js                [39m[1m[2m    1.51 kB[22m[1m[22m[2m │ gzip:   0.77 kB[22m[2m │ map:     4.75 kB[22m
2025-10-01T12:44:25.91445Z	[2mdist/[22m[2massets/[22m[36mtimezone-BBSHPwJT.js                  [39m[1m[2m    1.59 kB[22m[1m[22m[2m │ gzip:   0.63 kB[22m[2m │ map:     7.93 kB[22m
2025-10-01T12:44:25.914583Z	[2mdist/[22m[2massets/[22m[36museUserSubmittedEvents-BsAcSf-1.js    [39m[1m[2m    1.61 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m[2m │ map:     6.58 kB[22m
2025-10-01T12:44:25.914738Z	[2mdist/[22m[2massets/[22m[36museEvents-CIimIxwo.js                 [39m[1m[2m    1.68 kB[22m[1m[22m[2m │ gzip:   0.79 kB[22m[2m │ map:     7.28 kB[22m
2025-10-01T12:44:25.914869Z	[2mdist/[22m[2massets/[22m[36museSupabase-_N6Yn2UJ.js               [39m[1m[2m    1.78 kB[22m[1m[22m[2m │ gzip:   0.80 kB[22m[2m │ map:     9.68 kB[22m
2025-10-01T12:44:25.915016Z	[2mdist/[22m[2massets/[22m[36mcalendar-BlzaO1V7.js                  [39m[1m[2m    1.91 kB[22m[1m[22m[2m │ gzip:   0.85 kB[22m[2m │ map:     3.97 kB[22m
2025-10-01T12:44:25.915141Z	[2mdist/[22m[2massets/[22m[36mperformance-DRNioTBP.js               [39m[1m[2m    1.97 kB[22m[1m[22m[2m │ gzip:   0.89 kB[22m[2m │ map:     9.57 kB[22m
2025-10-01T12:44:25.915279Z	[2mdist/[22m[2massets/[22m[36mNotFound-fcgUXwQw.js                  [39m[1m[2m    2.00 kB[22m[1m[22m[2m │ gzip:   0.92 kB[22m[2m │ map:     4.16 kB[22m
2025-10-01T12:44:25.9154Z	[2mdist/[22m[2massets/[22m[36malert-dialog-CVSL9VBV.js              [39m[1m[2m    2.08 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m[2m │ map:     6.41 kB[22m
2025-10-01T12:44:25.915517Z	[2mdist/[22m[2massets/[22m[36mloading-skeleton-Dz2JPz5U.js          [39m[1m[2m    2.16 kB[22m[1m[22m[2m │ gzip:   0.80 kB[22m[2m │ map:     8.21 kB[22m
2025-10-01T12:44:25.915643Z	[2mdist/[22m[2massets/[22m[36mdialog-BQ_a3x37.js                    [39m[1m[2m    2.23 kB[22m[1m[22m[2m │ gzip:   0.89 kB[22m[2m │ map:     5.48 kB[22m
2025-10-01T12:44:25.915897Z	[2mdist/[22m[2massets/[22m[36museCampaigns-CcpIkXym.js              [39m[1m[2m    2.31 kB[22m[1m[22m[2m │ gzip:   0.91 kB[22m[2m │ map:     8.66 kB[22m
2025-10-01T12:44:25.916013Z	[2mdist/[22m[2massets/[22m[36mselect-De5Ji6QN.js                    [39m[1m[2m    3.00 kB[22m[1m[22m[2m │ gzip:   1.11 kB[22m[2m │ map:     8.01 kB[22m
2025-10-01T12:44:25.916131Z	[2mdist/[22m[2massets/[22m[36museRestaurants-B9D5ItOR.js            [39m[1m[2m    3.05 kB[22m[1m[22m[2m │ gzip:   1.12 kB[22m[2m │ map:    12.18 kB[22m
2025-10-01T12:44:25.916261Z	[2mdist/[22m[2massets/[22m[36museArticles-JSsQoSYB.js               [39m[1m[2m    3.21 kB[22m[1m[22m[2m │ gzip:   1.11 kB[22m[2m │ map:    11.38 kB[22m
2025-10-01T12:44:25.916384Z	[2mdist/[22m[2massets/[22m[36mEventPhotoUpload-BhTcVBf0.js          [39m[1m[2m    3.48 kB[22m[1m[22m[2m │ gzip:   1.58 kB[22m[2m │ map:    11.37 kB[22m
2025-10-01T12:44:25.916493Z	[2mdist/[22m[2massets/[22m[36mCampaignDashboard-p_oPsR8C.js         [39m[1m[2m    3.89 kB[22m[1m[22m[2m │ gzip:   1.29 kB[22m[2m │ map:     8.94 kB[22m
2025-10-01T12:44:25.916616Z	[2mdist/[22m[2massets/[22m[36museCommunityFeatures-BhqV23bJ.js      [39m[1m[2m    4.55 kB[22m[1m[22m[2m │ gzip:   1.50 kB[22m[2m │ map:    17.48 kB[22m
2025-10-01T12:44:25.916754Z	[2mdist/[22m[2massets/[22m[36mSEOHead-BXairrZU.js                   [39m[1m[2m    4.58 kB[22m[1m[22m[2m │ gzip:   1.52 kB[22m[2m │ map:    12.43 kB[22m
2025-10-01T12:44:25.916853Z	[2mdist/[22m[2massets/[22m[36mLocalSEO-CToWAuBV.js                  [39m[1m[2m    5.02 kB[22m[1m[22m[2m │ gzip:   1.62 kB[22m[2m │ map:    12.41 kB[22m
2025-10-01T12:44:25.916955Z	[2mdist/[22m[2massets/[22m[36mShareDialog-ByVb1X5c.js               [39m[1m[2m    5.18 kB[22m[1m[22m[2m │ gzip:   2.51 kB[22m[2m │ map:    11.47 kB[22m
2025-10-01T12:44:25.917051Z	[2mdist/[22m[2massets/[22m[36mEnhancedLocalSEO-dugKrai4.js          [39m[1m[2m    5.37 kB[22m[1m[22m[2m │ gzip:   1.69 kB[22m[2m │ map:    16.66 kB[22m
2025-10-01T12:44:25.91716Z	[2mdist/[22m[2massets/[22m[36mWeekendPage-C3wYCQre.js               [39m[1m[2m    5.56 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m[2m │ map:    14.76 kB[22m
2025-10-01T12:44:25.917263Z	[2mdist/[22m[2massets/[22m[36mAttractionDetails-fsl6KQK9.js         [39m[1m[2m    6.13 kB[22m[1m[22m[2m │ gzip:   2.23 kB[22m[2m │ map:    16.30 kB[22m
2025-10-01T12:44:25.91736Z	[2mdist/[22m[2massets/[22m[36mPlaygroundDetails-BwD0jHKz.js         [39m[1m[2m    6.51 kB[22m[1m[22m[2m │ gzip:   2.17 kB[22m[2m │ map:    17.43 kB[22m
2025-10-01T12:44:25.91746Z	[2mdist/[22m[2massets/[22m[36mEventsToday-M9NVRjii.js               [39m[1m[2m    6.72 kB[22m[1m[22m[2m │ gzip:   2.30 kB[22m[2m │ map:    13.94 kB[22m
2025-10-01T12:44:25.917565Z	[2mdist/[22m[2massets/[22m[36mEventCard-n4ZkLL7w.js                 [39m[1m[2m    7.14 kB[22m[1m[22m[2m │ gzip:   2.39 kB[22m[2m │ map:    23.52 kB[22m
2025-10-01T12:44:25.917664Z	[2mdist/[22m[2massets/[22m[36mArticleDetails-CqkDoRzf.js            [39m[1m[2m    7.48 kB[22m[1m[22m[2m │ gzip:   2.32 kB[22m[2m │ map:    18.28 kB[22m
2025-10-01T12:44:25.91778Z	[2mdist/[22m[2massets/[22m[36mAuth-BlOkecQ0.js                      [39m[1m[2m    7.71 kB[22m[1m[22m[2m │ gzip:   2.46 kB[22m[2m │ map:    21.63 kB[22m
2025-10-01T12:44:25.917938Z	[2mdist/[22m[2massets/[22m[36mNeighborhoodsPage-BhHTWR_d.js         [39m[1m[2m    7.82 kB[22m[1m[22m[2m │ gzip:   2.54 kB[22m[2m │ map:    14.84 kB[22m
2025-10-01T12:44:25.918036Z	[2mdist/[22m[2massets/[22m[36mAttractions-ByD639hx.js               [39m[1m[2m    8.35 kB[22m[1m[22m[2m │ gzip:   2.85 kB[22m[2m │ map:    22.36 kB[22m
2025-10-01T12:44:25.918127Z	[2mdist/[22m[2massets/[22m[36mMonthlyEventsPage-CEJdTEZv.js         [39m[1m[2m    8.39 kB[22m[1m[22m[2m │ gzip:   2.84 kB[22m[2m │ map:    20.27 kB[22m
2025-10-01T12:44:25.918242Z	[2mdist/[22m[2massets/[22m[36mEventsByLocation-CKNUYysb.js          [39m[1m[2m    8.87 kB[22m[1m[22m[2m │ gzip:   2.99 kB[22m[2m │ map:    20.21 kB[22m
2025-10-01T12:44:25.918337Z	[2mdist/[22m[2massets/[22m[36mGuidesPage-BOkrMT28.js                [39m[1m[2m    9.02 kB[22m[1m[22m[2m │ gzip:   2.86 kB[22m[2m │ map:    16.75 kB[22m
2025-10-01T12:44:25.918429Z	[2mdist/[22m[2massets/[22m[36mEventsThisWeekend-Dl12IMh2.js         [39m[1m[2m    9.07 kB[22m[1m[22m[2m │ gzip:   2.90 kB[22m[2m │ map:    23.21 kB[22m
2025-10-01T12:44:25.918532Z	[2mdist/[22m[2massets/[22m[36mAdminArticleEditor-CtIoIDTm.js        [39m[1m[2m    9.51 kB[22m[1m[22m[2m │ gzip:   3.04 kB[22m[2m │ map:    28.03 kB[22m
2025-10-01T12:44:25.918637Z	[2mdist/[22m[2massets/[22m[36mArticles-BoSZr46y.js                  [39m[1m[2m    9.65 kB[22m[1m[22m[2m │ gzip:   3.11 kB[22m[2m │ map:    25.08 kB[22m
2025-10-01T12:44:25.918747Z	[2mdist/[22m[2massets/[22m[36mPlaygrounds-Bu7Tbxjl.js               [39m[1m[2m   10.42 kB[22m[1m[22m[2m │ gzip:   3.53 kB[22m[2m │ map:    29.03 kB[22m
2025-10-01T12:44:25.918855Z	[2mdist/[22m[2massets/[22m[36mRestaurantsPage-C22cFCFU.js           [39m[1m[2m   10.52 kB[22m[1m[22m[2m │ gzip:   3.47 kB[22m[2m │ map:    28.69 kB[22m
2025-10-01T12:44:25.918962Z	[2mdist/[22m[2massets/[22m[36mSmartCalendarIntegration-DOYQO9Pq.js  [39m[1m[2m   11.06 kB[22m[1m[22m[2m │ gzip:   3.16 kB[22m[2m │ map:    34.84 kB[22m
2025-10-01T12:44:25.919058Z	[2mdist/[22m[2massets/[22m[36mProfile-yxsZ2DMK.js                   [39m[1m[2m   11.52 kB[22m[1m[22m[2m │ gzip:   3.27 kB[22m[2m │ map:    28.56 kB[22m
2025-10-01T12:44:25.919191Z	[2mdist/[22m[2massets/[22m[36mRestaurantDetails-C4ZLVgWy.js         [39m[1m[2m   14.38 kB[22m[1m[22m[2m │ gzip:   3.92 kB[22m[2m │ map:    38.88 kB[22m
2025-10-01T12:44:25.919313Z	[2mdist/[22m[2massets/[22m[36museEventSocial-Wm72l2Wl.js            [39m[1m[2m   14.54 kB[22m[1m[22m[2m │ gzip:   4.30 kB[22m[2m │ map:    42.49 kB[22m
2025-10-01T12:44:25.919415Z	[2mdist/[22m[2massets/[22m[36mUserDashboard-BXWPl9wD.js             [39m[1m[2m   15.27 kB[22m[1m[22m[2m │ gzip:   4.38 kB[22m[2m │ map:    39.51 kB[22m
2025-10-01T12:44:25.919511Z	[2mdist/[22m[2massets/[22m[36mGamification-D7P4hM0u.js              [39m[1m[2m   18.15 kB[22m[1m[22m[2m │ gzip:   4.82 kB[22m[2m │ map:    50.69 kB[22m
2025-10-01T12:44:25.919603Z	[2mdist/[22m[2massets/[22m[36mAdvertise-DWBO_Ggc.js                 [39m[1m[2m   18.30 kB[22m[1m[22m[2m │ gzip:   4.81 kB[22m[2m │ map:    42.21 kB[22m
2025-10-01T12:44:25.919704Z	[2mdist/[22m[2massets/[22m[36mEventsPage-djr1RbAl.js                [39m[1m[2m   18.46 kB[22m[1m[22m[2m │ gzip:   5.78 kB[22m[2m │ map:    52.48 kB[22m
2025-10-01T12:44:25.919808Z	[2mdist/[22m[2massets/[22m[36mIowaStateFairPage-CLGNM8M0.js         [39m[1m[2m   18.61 kB[22m[1m[22m[2m │ gzip:   5.05 kB[22m[2m │ map:    35.39 kB[22m
2025-10-01T12:44:25.919901Z	[2mdist/[22m[2massets/[22m[36mNeighborhoodPage-DdnL8ftS.js          [39m[1m[2m   19.02 kB[22m[1m[22m[2m │ gzip:   5.35 kB[22m[2m │ map:    35.14 kB[22m
2025-10-01T12:44:25.920027Z	[2mdist/[22m[2massets/[22m[36mSocial-qJTfryXF.js                    [39m[1m[2m   22.03 kB[22m[1m[22m[2m │ gzip:   5.10 kB[22m[2m │ map:    64.79 kB[22m
2025-10-01T12:44:25.920138Z	[2mdist/[22m[2massets/[22m[36mindex-DvtDXccV.js                     [39m[1m[2m   22.62 kB[22m[1m[22m[2m │ gzip:   7.05 kB[22m[2m │ map:    47.51 kB[22m
2025-10-01T12:44:25.920258Z	[2mdist/[22m[2massets/[22m[36mAdvancedSearchPage-CnHSOv-F.js        [39m[1m[2m   24.01 kB[22m[1m[22m[2m │ gzip:   6.36 kB[22m[2m │ map:    77.43 kB[22m
2025-10-01T12:44:25.920366Z	[2mdist/[22m[2massets/[22m[36mFooter-Bxr8WUVN.js                    [39m[1m[2m   25.30 kB[22m[1m[22m[2m │ gzip:   6.90 kB[22m[2m │ map:    68.29 kB[22m
2025-10-01T12:44:25.920478Z	[2mdist/[22m[2massets/[22m[36mRestaurants-DNwgtMPV.js               [39m[1m[2m   26.38 kB[22m[1m[22m[2m │ gzip:   7.24 kB[22m[2m │ map:    63.75 kB[22m
2025-10-01T12:44:25.920581Z	[2mdist/[22m[2massets/[22m[36mBusinessPartnership-B0mYi05z.js       [39m[1m[2m   26.66 kB[22m[1m[22m[2m │ gzip:   5.98 kB[22m[2m │ map:    71.57 kB[22m
2025-10-01T12:44:25.920682Z	[2mdist/[22m[2massets/[22m[36mRealTimePage-FC6oC0aD.js              [39m[1m[2m   29.16 kB[22m[1m[22m[2m │ gzip:   7.34 kB[22m[2m │ map:    67.10 kB[22m
2025-10-01T12:44:25.920802Z	[2mdist/[22m[2massets/[22m[36mEventDetails-CLjwCNlT.js              [39m[1m[2m   29.30 kB[22m[1m[22m[2m │ gzip:   7.85 kB[22m[2m │ map:    85.87 kB[22m
2025-10-01T12:44:25.920908Z	[2mdist/[22m[2massets/[22m[36mvendor-query-BVjCvOi4.js              [39m[1m[2m   34.48 kB[22m[1m[22m[2m │ gzip:   9.87 kB[22m[2m │ map:   126.36 kB[22m
2025-10-01T12:44:25.921016Z	[2mdist/[22m[2massets/[22m[36mvendor-date-CZLXoD8C.js               [39m[1m[2m   35.26 kB[22m[1m[22m[2m │ gzip:  10.28 kB[22m[2m │ map:   282.47 kB[22m
2025-10-01T12:44:25.921119Z	[2mdist/[22m[2massets/[22m[36mIndex-DjoKO2Z2.js                     [39m[1m[2m   94.58 kB[22m[1m[22m[2m │ gzip:  23.96 kB[22m[2m │ map:   292.87 kB[22m
2025-10-01T12:44:25.921238Z	[2mdist/[22m[2massets/[22m[36mvendor-supabase-CHM5h-i2.js           [39m[1m[2m  114.22 kB[22m[1m[22m[2m │ gzip:  30.12 kB[22m[2m │ map:   495.43 kB[22m
2025-10-01T12:44:25.921339Z	[2mdist/[22m[2massets/[22m[36mAdmin-BB1useVz.js                     [39m[1m[2m  315.65 kB[22m[1m[22m[2m │ gzip:  65.06 kB[22m[2m │ map:   942.46 kB[22m
2025-10-01T12:44:25.921432Z	[2mdist/[22m[2massets/[22m[36mvendor-react-BJUTLwRx.js              [39m[1m[33m1,010.25 kB[39m[22m[2m │ gzip: 289.03 kB[22m[2m │ map: 3,447.24 kB[22m
2025-10-01T12:44:25.921523Z	[2mdist/[22m[2massets/[22m[36mvendor-other-BlNzYQKF.js              [39m[1m[33m1,273.24 kB[39m[22m[2m │ gzip: 334.43 kB[22m[2m │ map: 5,121.47 kB[22m
2025-10-01T12:44:25.921616Z	[32m✓ built in 37.66s[39m
2025-10-01T12:44:25.92172Z	[33m
2025-10-01T12:44:25.921822Z	(!) Some chunks are larger than 600 kB after minification. Consider:
2025-10-01T12:44:25.92191Z	- Using dynamic import() to code-split the application
2025-10-01T12:44:25.922Z	- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
2025-10-01T12:44:25.922099Z	- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
2025-10-01T12:44:26.241125Z	Finished
2025-10-01T12:44:27.17249Z	Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T12:44:27.172989Z	
2025-10-01T12:44:28.274501Z	No wrangler.toml file found. Continuing.
2025-10-01T12:44:28.27542Z	Found Functions directory at /functions. Uploading.
2025-10-01T12:44:28.281537Z	 ⛅️ wrangler 3.101.0
2025-10-01T12:44:28.281848Z	-------------------
2025-10-01T12:44:29.214049Z	✨ Compiled Worker successfully
2025-10-01T12:44:30.293573Z	Found _routes.json in output directory. Uploading.
2025-10-01T12:44:30.305382Z	Validating asset output directory
2025-10-01T12:44:33.290564Z	Deploying your site to Cloudflare's global network...
2025-10-01T12:44:36.147634Z	Parsed 20 valid header rules.
2025-10-01T12:44:37.416106Z	Uploading... (200/200)
2025-10-01T12:44:37.416958Z	✨ Success! Uploaded 0 files (200 already uploaded) (0.25 sec)
2025-10-01T12:44:37.417126Z	
2025-10-01T12:44:37.964665Z	✨ Upload complete!
2025-10-01T12:44:41.177868Z	Uploading to dependency cache
2025-10-01T12:44:41.252752Z	Skipping build output cache as it's not supported for your project
2025-10-01T12:44:42.585796Z	Success: Dependencies uploaded to build cache.
2025-10-01T12:44:44.332729Z	Success: Assets published!
2025-10-01T12:44:46.57272Z	Success: Your site was deployed!