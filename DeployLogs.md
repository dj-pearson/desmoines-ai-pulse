<<<<<<< HEAD
2025-10-01T12:36:03.603667Z Cloning repository...
2025-10-01T12:36:05.015071Z From https://github.com/dj-pearson/desmoines-ai-pulse
2025-10-01T12:36:05.015601Z * branch 6babfd2b625f00371823dc6c79570a1a27dc8705 -> FETCH_HEAD
2025-10-01T12:36:05.015698Z
2025-10-01T12:36:05.120666Z HEAD is now at 6babfd2 FORCE CACHE CLEAR: Bump service worker and add cache version
2025-10-01T12:36:05.121868Z
2025-10-01T12:36:05.201691Z
2025-10-01T12:36:05.202618Z Using v2 root directory strategy
2025-10-01T12:36:05.226474Z Success: Finished cloning repository files
2025-10-01T12:36:06.215435Z Restoring from dependencies cache
2025-10-01T12:36:06.232302Z Restoring from build output cache
2025-10-01T12:36:08.181999Z Success: Dependencies restored from build cache.
2025-10-01T12:36:09.328493Z Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T12:36:09.329381Z
2025-10-01T12:36:10.430113Z No wrangler.toml file found. Continuing.
2025-10-01T12:36:10.509405Z Detected the following tools from environment: nodejs@20.18.0, npm@10.9.2
2025-10-01T12:36:10.510066Z Installing nodejs 20.18.0
2025-10-01T12:36:11.710622Z Trying to update node-build... ok
2025-10-01T12:36:11.814434Z To follow progress, use 'tail -f /tmp/node-build.20251001123611.502.log' or pass --verbose
2025-10-01T12:36:11.920897Z Downloading node-v20.18.0-linux-x64.tar.gz...
2025-10-01T12:36:12.145646Z -> https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz
2025-10-01T12:36:13.855708Z
2025-10-01T12:36:13.856211Z WARNING: node-v20.18.0-linux-x64 is in LTS Maintenance mode and nearing its end of life.
2025-10-01T12:36:13.856366Z It only receives *critical* security updates, *critical\* bug fixes and documentation updates.
2025-10-01T12:36:13.856563Z
2025-10-01T12:36:13.856654Z Installing node-v20.18.0-linux-x64...
2025-10-01T12:36:14.282768Z Installed node-v20.18.0-linux-x64 to /opt/buildhome/.asdf/installs/nodejs/20.18.0
2025-10-01T12:36:14.283375Z
2025-10-01T12:36:15.372534Z Installing project dependencies: npm clean-install --progress=false
2025-10-01T12:36:18.955192Z npm warn deprecated @types/dompurify@3.2.0: This is a stub types definition. dompurify provides its own type definitions, so you do not need this installed.
2025-10-01T12:36:20.747098Z npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
2025-10-01T12:36:25.594797Z npm warn deprecated three-mesh-bvh@0.7.8: Deprecated due to three.js version incompatibility. Please use v0.8.0, instead.
2025-10-01T12:36:42.950445Z
2025-10-01T12:36:42.950906Z added 695 packages, and audited 696 packages in 27s
2025-10-01T12:36:42.951266Z
2025-10-01T12:36:42.951443Z 103 packages are looking for funding
2025-10-01T12:36:42.951605Z run `npm fund` for details
2025-10-01T12:36:42.9793Z
2025-10-01T12:36:42.979659Z 6 vulnerabilities (3 low, 3 moderate)
2025-10-01T12:36:42.979818Z
2025-10-01T12:36:42.979998Z To address all issues, run:
2025-10-01T12:36:42.980154Z npm audit fix
2025-10-01T12:36:42.980294Z
2025-10-01T12:36:42.98041Z Run `npm audit` for details.
2025-10-01T12:36:43.004159Z Executing user command: npm run build
2025-10-01T12:36:43.413395Z
2025-10-01T12:36:43.413831Z > vite_react_shadcn_ts@0.0.0 build
2025-10-01T12:36:43.413946Z > vite build
2025-10-01T12:36:43.414093Z
2025-10-01T12:36:43.726312Z [36mvite v5.4.10 [32mbuilding for production...[36m[39m
2025-10-01T12:36:44.096221Z transforming...
2025-10-01T12:37:03.744138Z [32m✓[39m 4260 modules transformed.
2025-10-01T12:37:05.718814Z rendering chunks...
2025-10-01T12:37:26.902245Z computing gzip size...
2025-10-01T12:37:27.111429Z [2mdist/[22m[32mindex.html [39m[1m[2m 15.02 kB[22m[1m[22m[2m │ gzip: 4.05 kB[22m
2025-10-01T12:37:27.11185Z [2mdist/[22m[2massets/[22m[35mvendor-other-Dgihpmma.css [39m[1m[2m 15.04 kB[22m[1m[22m[2m │ gzip: 6.38 kB[22m
2025-10-01T12:37:27.112117Z [2mdist/[22m[2massets/[22m[35mindex-IE542Gmw.css [39m[1m[2m 125.20 kB[22m[1m[22m[2m │ gzip: 19.50 kB[22m
2025-10-01T12:37:27.112385Z [2mdist/[22m[2massets/[22m[36mvendor-ui-ByoYm48K.js [39m[1m[2m 0.25 kB[22m[1m[22m[2m │ gzip: 0.21 kB[22m[2m │ map: 1.25 kB[22m
2025-10-01T12:37:27.112637Z [2mdist/[22m[2massets/[22m[36mskeleton-mGuZGEtJ.js [39m[1m[2m 0.26 kB[22m[1m[22m[2m │ gzip: 0.22 kB[22m[2m │ map: 0.55 kB[22m
2025-10-01T12:37:27.112908Z [2mdist/[22m[2massets/[22m[36mseparator-Dae1tIj8.js [39m[1m[2m 0.42 kB[22m[1m[22m[2m │ gzip: 0.31 kB[22m[2m │ map: 1.29 kB[22m
2025-10-01T12:37:27.1132Z [2mdist/[22m[2massets/[22m[36mlabel-DbpYWBHN.js [39m[1m[2m 0.42 kB[22m[1m[22m[2m │ gzip: 0.30 kB[22m[2m │ map: 1.17 kB[22m
2025-10-01T12:37:27.113385Z [2mdist/[22m[2massets/[22m[36mclient-CuNO40hr.js [39m[1m[2m 0.44 kB[22m[1m[22m[2m │ gzip: 0.38 kB[22m[2m │ map: 1.14 kB[22m
2025-10-01T12:37:27.113575Z [2mdist/[22m[2massets/[22m[36mprogress-DZNUXRMr.js [39m[1m[2m 0.48 kB[22m[1m[22m[2m │ gzip: 0.36 kB[22m[2m │ map: 1.38 kB[22m
2025-10-01T12:37:27.113711Z [2mdist/[22m[2massets/[22m[36mtextarea-BziXp-7B.js [39m[1m[2m 0.57 kB[22m[1m[22m[2m │ gzip: 0.38 kB[22m[2m │ map: 1.13 kB[22m
2025-10-01T12:37:27.113838Z [2mdist/[22m[2massets/[22m[36minput-e-4gUWzU.js [39m[1m[2m 0.66 kB[22m[1m[22m[2m │ gzip: 0.41 kB[22m[2m │ map: 1.16 kB[22m
2025-10-01T12:37:27.114037Z [2mdist/[22m[2massets/[22m[36mcheckbox-Bq650Bpd.js [39m[1m[2m 0.72 kB[22m[1m[22m[2m │ gzip: 0.43 kB[22m[2m │ map: 1.63 kB[22m
2025-10-01T12:37:27.114221Z [2mdist/[22m[2massets/[22m[36mslider-B3N1sq2i.js [39m[1m[2m 0.80 kB[22m[1m[22m[2m │ gzip: 0.47 kB[22m[2m │ map: 1.71 kB[22m
2025-10-01T12:37:27.114378Z [2mdist/[22m[2massets/[22m[36mpopover-BBPRIcpx.js [39m[1m[2m 0.82 kB[22m[1m[22m[2m │ gzip: 0.45 kB[22m[2m │ map: 1.83 kB[22m
2025-10-01T12:37:27.114503Z [2mdist/[22m[2massets/[22m[36mbadge-DZ0-1i3v.js [39m[1m[2m 0.83 kB[22m[1m[22m[2m │ gzip: 0.45 kB[22m[2m │ map: 1.70 kB[22m
2025-10-01T12:37:27.114634Z [2mdist/[22m[2massets/[22m[36mswitch-Ds0ODq3k.js [39m[1m[2m 0.86 kB[22m[1m[22m[2m │ gzip: 0.48 kB[22m[2m │ map: 1.63 kB[22m
2025-10-01T12:37:27.114759Z [2mdist/[22m[2massets/[22m[36malert-2sReonCP.js [39m[1m[2m 1.02 kB[22m[1m[22m[2m │ gzip: 0.54 kB[22m[2m │ map: 2.47 kB[22m
2025-10-01T12:37:27.114882Z [2mdist/[22m[2massets/[22m[36merrorSuppression-LVnJe3hs.js [39m[1m[2m 1.08 kB[22m[1m[22m[2m │ gzip: 0.55 kB[22m[2m │ map: 4.33 kB[22m
2025-10-01T12:37:27.115019Z [2mdist/[22m[2massets/[22m[36museProfile-ar63XZr0.js [39m[1m[2m 1.09 kB[22m[1m[22m[2m │ gzip: 0.58 kB[22m[2m │ map: 4.51 kB[22m
2025-10-01T12:37:27.115165Z [2mdist/[22m[2massets/[22m[36mtabs-Do7v7h8b.js [39m[1m[2m 1.16 kB[22m[1m[22m[2m │ gzip: 0.51 kB[22m[2m │ map: 2.70 kB[22m
2025-10-01T12:37:27.11531Z [2mdist/[22m[2massets/[22m[36mAIWriteup-Cz2Aju73.js [39m[1m[2m 1.35 kB[22m[1m[22m[2m │ gzip: 0.72 kB[22m[2m │ map: 3.15 kB[22m
2025-10-01T12:37:27.115433Z [2mdist/[22m[2massets/[22m[36musePlaygrounds-CcQa7Amw.js [39m[1m[2m 1.39 kB[22m[1m[22m[2m │ gzip: 0.65 kB[22m[2m │ map: 5.68 kB[22m
2025-10-01T12:37:27.115546Z [2mdist/[22m[2massets/[22m[36museSocialFeatures-C6u7xR9M.js [39m[1m[2m 1.48 kB[22m[1m[22m[2m │ gzip: 0.66 kB[22m[2m │ map: 9.52 kB[22m
2025-10-01T12:37:27.115658Z [2mdist/[22m[2massets/[22m[36museAuth-QYBUzbbh.js [39m[1m[2m 1.49 kB[22m[1m[22m[2m │ gzip: 0.73 kB[22m[2m │ map: 6.23 kB[22m
2025-10-01T12:37:27.115765Z [2mdist/[22m[2massets/[22m[36museAttractions-D1JZsT8f.js [39m[1m[2m 1.50 kB[22m[1m[22m[2m │ gzip: 0.70 kB[22m[2m │ map: 6.15 kB[22m
2025-10-01T12:37:27.115875Z [2mdist/[22m[2massets/[22m[36mFAQSection-C13Mv9Kx.js [39m[1m[2m 1.51 kB[22m[1m[22m[2m │ gzip: 0.77 kB[22m[2m │ map: 4.75 kB[22m
2025-10-01T12:37:27.116019Z [2mdist/[22m[2massets/[22m[36mtimezone-BBSHPwJT.js [39m[1m[2m 1.59 kB[22m[1m[22m[2m │ gzip: 0.63 kB[22m[2m │ map: 7.93 kB[22m
2025-10-01T12:37:27.11615Z [2mdist/[22m[2massets/[22m[36museUserSubmittedEvents-BsAcSf-1.js [39m[1m[2m 1.61 kB[22m[1m[22m[2m │ gzip: 0.65 kB[22m[2m │ map: 6.58 kB[22m
2025-10-01T12:37:27.11627Z [2mdist/[22m[2massets/[22m[36museEvents-CIimIxwo.js [39m[1m[2m 1.68 kB[22m[1m[22m[2m │ gzip: 0.79 kB[22m[2m │ map: 7.28 kB[22m
2025-10-01T12:37:27.116405Z [2mdist/[22m[2massets/[22m[36museSupabase-\_N6Yn2UJ.js [39m[1m[2m 1.78 kB[22m[1m[22m[2m │ gzip: 0.80 kB[22m[2m │ map: 9.68 kB[22m
2025-10-01T12:37:27.116537Z [2mdist/[22m[2massets/[22m[36mcalendar-BlzaO1V7.js [39m[1m[2m 1.91 kB[22m[1m[22m[2m │ gzip: 0.85 kB[22m[2m │ map: 3.97 kB[22m
2025-10-01T12:37:27.11667Z [2mdist/[22m[2massets/[22m[36mperformance-DRNioTBP.js [39m[1m[2m 1.97 kB[22m[1m[22m[2m │ gzip: 0.89 kB[22m[2m │ map: 9.57 kB[22m
2025-10-01T12:37:27.116794Z [2mdist/[22m[2massets/[22m[36mNotFound-fcgUXwQw.js [39m[1m[2m 2.00 kB[22m[1m[22m[2m │ gzip: 0.92 kB[22m[2m │ map: 4.16 kB[22m
2025-10-01T12:37:27.116903Z [2mdist/[22m[2massets/[22m[36malert-dialog-CVSL9VBV.js [39m[1m[2m 2.08 kB[22m[1m[22m[2m │ gzip: 0.78 kB[22m[2m │ map: 6.41 kB[22m
2025-10-01T12:37:27.117025Z [2mdist/[22m[2massets/[22m[36mloading-skeleton-Dz2JPz5U.js [39m[1m[2m 2.16 kB[22m[1m[22m[2m │ gzip: 0.80 kB[22m[2m │ map: 8.21 kB[22m
2025-10-01T12:37:27.117297Z [2mdist/[22m[2massets/[22m[36mdialog-BQ_a3x37.js [39m[1m[2m 2.23 kB[22m[1m[22m[2m │ gzip: 0.89 kB[22m[2m │ map: 5.48 kB[22m
2025-10-01T12:37:27.117418Z [2mdist/[22m[2massets/[22m[36museCampaigns-CcpIkXym.js [39m[1m[2m 2.31 kB[22m[1m[22m[2m │ gzip: 0.91 kB[22m[2m │ map: 8.66 kB[22m
2025-10-01T12:37:27.117522Z [2mdist/[22m[2massets/[22m[36mselect-De5Ji6QN.js [39m[1m[2m 3.00 kB[22m[1m[22m[2m │ gzip: 1.11 kB[22m[2m │ map: 8.01 kB[22m
2025-10-01T12:37:27.117625Z [2mdist/[22m[2massets/[22m[36museRestaurants-B9D5ItOR.js [39m[1m[2m 3.05 kB[22m[1m[22m[2m │ gzip: 1.12 kB[22m[2m │ map: 12.18 kB[22m
2025-10-01T12:37:27.117726Z [2mdist/[22m[2massets/[22m[36museArticles-JSsQoSYB.js [39m[1m[2m 3.21 kB[22m[1m[22m[2m │ gzip: 1.11 kB[22m[2m │ map: 11.38 kB[22m
2025-10-01T12:37:27.117987Z [2mdist/[22m[2massets/[22m[36mEventPhotoUpload-BhTcVBf0.js [39m[1m[2m 3.48 kB[22m[1m[22m[2m │ gzip: 1.58 kB[22m[2m │ map: 11.37 kB[22m
2025-10-01T12:37:27.118201Z [2mdist/[22m[2massets/[22m[36mCampaignDashboard-p_oPsR8C.js [39m[1m[2m 3.89 kB[22m[1m[22m[2m │ gzip: 1.29 kB[22m[2m │ map: 8.94 kB[22m
2025-10-01T12:37:27.118322Z [2mdist/[22m[2massets/[22m[36museCommunityFeatures-BhqV23bJ.js [39m[1m[2m 4.55 kB[22m[1m[22m[2m │ gzip: 1.50 kB[22m[2m │ map: 17.48 kB[22m
2025-10-01T12:37:27.118424Z [2mdist/[22m[2massets/[22m[36mSEOHead-BXairrZU.js [39m[1m[2m 4.58 kB[22m[1m[22m[2m │ gzip: 1.52 kB[22m[2m │ map: 12.43 kB[22m
2025-10-01T12:37:27.118526Z [2mdist/[22m[2massets/[22m[36mLocalSEO-CToWAuBV.js [39m[1m[2m 5.02 kB[22m[1m[22m[2m │ gzip: 1.62 kB[22m[2m │ map: 12.41 kB[22m
2025-10-01T12:37:27.11863Z [2mdist/[22m[2massets/[22m[36mShareDialog-ByVb1X5c.js [39m[1m[2m 5.18 kB[22m[1m[22m[2m │ gzip: 2.51 kB[22m[2m │ map: 11.47 kB[22m
2025-10-01T12:37:27.118729Z [2mdist/[22m[2massets/[22m[36mEnhancedLocalSEO-dugKrai4.js [39m[1m[2m 5.37 kB[22m[1m[22m[2m │ gzip: 1.69 kB[22m[2m │ map: 16.66 kB[22m
2025-10-01T12:37:27.118833Z [2mdist/[22m[2massets/[22m[36mWeekendPage-C3wYCQre.js [39m[1m[2m 5.56 kB[22m[1m[22m[2m │ gzip: 2.16 kB[22m[2m │ map: 14.76 kB[22m
2025-10-01T12:37:27.118932Z [2mdist/[22m[2massets/[22m[36mAttractionDetails-fsl6KQK9.js [39m[1m[2m 6.13 kB[22m[1m[22m[2m │ gzip: 2.23 kB[22m[2m │ map: 16.30 kB[22m
2025-10-01T12:37:27.119048Z [2mdist/[22m[2massets/[22m[36mPlaygroundDetails-BwD0jHKz.js [39m[1m[2m 6.51 kB[22m[1m[22m[2m │ gzip: 2.17 kB[22m[2m │ map: 17.43 kB[22m
2025-10-01T12:37:27.119156Z [2mdist/[22m[2massets/[22m[36mEventsToday-M9NVRjii.js [39m[1m[2m 6.72 kB[22m[1m[22m[2m │ gzip: 2.30 kB[22m[2m │ map: 13.94 kB[22m
2025-10-01T12:37:27.119262Z [2mdist/[22m[2massets/[22m[36mEventCard-n4ZkLL7w.js [39m[1m[2m 7.14 kB[22m[1m[22m[2m │ gzip: 2.39 kB[22m[2m │ map: 23.52 kB[22m
2025-10-01T12:37:27.119357Z [2mdist/[22m[2massets/[22m[36mArticleDetails-CqkDoRzf.js [39m[1m[2m 7.48 kB[22m[1m[22m[2m │ gzip: 2.32 kB[22m[2m │ map: 18.28 kB[22m
2025-10-01T12:37:27.11947Z [2mdist/[22m[2massets/[22m[36mAuth-BlOkecQ0.js [39m[1m[2m 7.71 kB[22m[1m[22m[2m │ gzip: 2.46 kB[22m[2m │ map: 21.63 kB[22m
2025-10-01T12:37:27.119583Z [2mdist/[22m[2massets/[22m[36mNeighborhoodsPage-BhHTWR_d.js [39m[1m[2m 7.82 kB[22m[1m[22m[2m │ gzip: 2.54 kB[22m[2m │ map: 14.84 kB[22m
2025-10-01T12:37:27.119694Z [2mdist/[22m[2massets/[22m[36mAttractions-ByD639hx.js [39m[1m[2m 8.35 kB[22m[1m[22m[2m │ gzip: 2.85 kB[22m[2m │ map: 22.36 kB[22m
2025-10-01T12:37:27.119798Z [2mdist/[22m[2massets/[22m[36mMonthlyEventsPage-CEJdTEZv.js [39m[1m[2m 8.39 kB[22m[1m[22m[2m │ gzip: 2.84 kB[22m[2m │ map: 20.27 kB[22m
2025-10-01T12:37:27.119898Z [2mdist/[22m[2massets/[22m[36mEventsByLocation-CKNUYysb.js [39m[1m[2m 8.87 kB[22m[1m[22m[2m │ gzip: 2.99 kB[22m[2m │ map: 20.21 kB[22m
2025-10-01T12:37:27.119996Z [2mdist/[22m[2massets/[22m[36mGuidesPage-BOkrMT28.js [39m[1m[2m 9.02 kB[22m[1m[22m[2m │ gzip: 2.86 kB[22m[2m │ map: 16.75 kB[22m
2025-10-01T12:37:27.120195Z [2mdist/[22m[2massets/[22m[36mEventsThisWeekend-Dl12IMh2.js [39m[1m[2m 9.07 kB[22m[1m[22m[2m │ gzip: 2.90 kB[22m[2m │ map: 23.21 kB[22m
2025-10-01T12:37:27.120308Z [2mdist/[22m[2massets/[22m[36mAdminArticleEditor-CtIoIDTm.js [39m[1m[2m 9.51 kB[22m[1m[22m[2m │ gzip: 3.04 kB[22m[2m │ map: 28.03 kB[22m
2025-10-01T12:37:27.120408Z [2mdist/[22m[2massets/[22m[36mArticles-BoSZr46y.js [39m[1m[2m 9.65 kB[22m[1m[22m[2m │ gzip: 3.11 kB[22m[2m │ map: 25.08 kB[22m
2025-10-01T12:37:27.120519Z [2mdist/[22m[2massets/[22m[36mPlaygrounds-Bu7Tbxjl.js [39m[1m[2m 10.42 kB[22m[1m[22m[2m │ gzip: 3.53 kB[22m[2m │ map: 29.03 kB[22m
2025-10-01T12:37:27.120622Z [2mdist/[22m[2massets/[22m[36mRestaurantsPage-C22cFCFU.js [39m[1m[2m 10.52 kB[22m[1m[22m[2m │ gzip: 3.47 kB[22m[2m │ map: 28.69 kB[22m
2025-10-01T12:37:27.120718Z [2mdist/[22m[2massets/[22m[36mSmartCalendarIntegration-DOYQO9Pq.js [39m[1m[2m 11.06 kB[22m[1m[22m[2m │ gzip: 3.16 kB[22m[2m │ map: 34.84 kB[22m
2025-10-01T12:37:27.120816Z [2mdist/[22m[2massets/[22m[36mProfile-yxsZ2DMK.js [39m[1m[2m 11.52 kB[22m[1m[22m[2m │ gzip: 3.27 kB[22m[2m │ map: 28.56 kB[22m
2025-10-01T12:37:27.120904Z [2mdist/[22m[2massets/[22m[36mRestaurantDetails-C4ZLVgWy.js [39m[1m[2m 14.38 kB[22m[1m[22m[2m │ gzip: 3.92 kB[22m[2m │ map: 38.88 kB[22m
2025-10-01T12:37:27.121022Z [2mdist/[22m[2massets/[22m[36museEventSocial-Wm72l2Wl.js [39m[1m[2m 14.54 kB[22m[1m[22m[2m │ gzip: 4.30 kB[22m[2m │ map: 42.49 kB[22m
2025-10-01T12:37:27.121143Z [2mdist/[22m[2massets/[22m[36mUserDashboard-BXWPl9wD.js [39m[1m[2m 15.27 kB[22m[1m[22m[2m │ gzip: 4.38 kB[22m[2m │ map: 39.51 kB[22m
2025-10-01T12:37:27.121257Z [2mdist/[22m[2massets/[22m[36mGamification-D7P4hM0u.js [39m[1m[2m 18.15 kB[22m[1m[22m[2m │ gzip: 4.82 kB[22m[2m │ map: 50.69 kB[22m
2025-10-01T12:37:27.121357Z [2mdist/[22m[2massets/[22m[36mAdvertise-DWBO_Ggc.js [39m[1m[2m 18.30 kB[22m[1m[22m[2m │ gzip: 4.81 kB[22m[2m │ map: 42.21 kB[22m
2025-10-01T12:37:27.121453Z [2mdist/[22m[2massets/[22m[36mEventsPage-djr1RbAl.js [39m[1m[2m 18.46 kB[22m[1m[22m[2m │ gzip: 5.78 kB[22m[2m │ map: 52.48 kB[22m
2025-10-01T12:37:27.121555Z [2mdist/[22m[2massets/[22m[36mIowaStateFairPage-CLGNM8M0.js [39m[1m[2m 18.61 kB[22m[1m[22m[2m │ gzip: 5.05 kB[22m[2m │ map: 35.39 kB[22m
2025-10-01T12:37:27.121661Z [2mdist/[22m[2massets/[22m[36mNeighborhoodPage-DdnL8ftS.js [39m[1m[2m 19.02 kB[22m[1m[22m[2m │ gzip: 5.35 kB[22m[2m │ map: 35.14 kB[22m
2025-10-01T12:37:27.12184Z [2mdist/[22m[2massets/[22m[36mSocial-qJTfryXF.js [39m[1m[2m 22.03 kB[22m[1m[22m[2m │ gzip: 5.10 kB[22m[2m │ map: 64.79 kB[22m
2025-10-01T12:37:27.121956Z [2mdist/[22m[2massets/[22m[36mindex-DvtDXccV.js [39m[1m[2m 22.62 kB[22m[1m[22m[2m │ gzip: 7.05 kB[22m[2m │ map: 47.51 kB[22m
2025-10-01T12:37:27.122071Z [2mdist/[22m[2massets/[22m[36mAdvancedSearchPage-CnHSOv-F.js [39m[1m[2m 24.01 kB[22m[1m[22m[2m │ gzip: 6.36 kB[22m[2m │ map: 77.43 kB[22m
2025-10-01T12:37:27.122172Z [2mdist/[22m[2massets/[22m[36mFooter-Bxr8WUVN.js [39m[1m[2m 25.30 kB[22m[1m[22m[2m │ gzip: 6.90 kB[22m[2m │ map: 68.29 kB[22m
2025-10-01T12:37:27.122279Z [2mdist/[22m[2massets/[22m[36mRestaurants-DNwgtMPV.js [39m[1m[2m 26.38 kB[22m[1m[22m[2m │ gzip: 7.24 kB[22m[2m │ map: 63.75 kB[22m
2025-10-01T12:37:27.122384Z [2mdist/[22m[2massets/[22m[36mBusinessPartnership-B0mYi05z.js [39m[1m[2m 26.66 kB[22m[1m[22m[2m │ gzip: 5.98 kB[22m[2m │ map: 71.57 kB[22m
2025-10-01T12:37:27.122498Z [2mdist/[22m[2massets/[22m[36mRealTimePage-FC6oC0aD.js [39m[1m[2m 29.16 kB[22m[1m[22m[2m │ gzip: 7.34 kB[22m[2m │ map: 67.10 kB[22m
2025-10-01T12:37:27.122602Z [2mdist/[22m[2massets/[22m[36mEventDetails-CLjwCNlT.js [39m[1m[2m 29.30 kB[22m[1m[22m[2m │ gzip: 7.85 kB[22m[2m │ map: 85.87 kB[22m
2025-10-01T12:37:27.122703Z [2mdist/[22m[2massets/[22m[36mvendor-query-BVjCvOi4.js [39m[1m[2m 34.48 kB[22m[1m[22m[2m │ gzip: 9.87 kB[22m[2m │ map: 126.36 kB[22m
2025-10-01T12:37:27.122813Z [2mdist/[22m[2massets/[22m[36mvendor-date-CZLXoD8C.js [39m[1m[2m 35.26 kB[22m[1m[22m[2m │ gzip: 10.28 kB[22m[2m │ map: 282.47 kB[22m
2025-10-01T12:37:27.122915Z [2mdist/[22m[2massets/[22m[36mIndex-DjoKO2Z2.js [39m[1m[2m 94.58 kB[22m[1m[22m[2m │ gzip: 23.96 kB[22m[2m │ map: 292.87 kB[22m
2025-10-01T12:37:27.123021Z [2mdist/[22m[2massets/[22m[36mvendor-supabase-CHM5h-i2.js [39m[1m[2m 114.22 kB[22m[1m[22m[2m │ gzip: 30.12 kB[22m[2m │ map: 495.43 kB[22m
2025-10-01T12:37:27.12312Z [2mdist/[22m[2massets/[22m[36mAdmin-BB1useVz.js [39m[1m[2m 315.65 kB[22m[1m[22m[2m │ gzip: 65.06 kB[22m[2m │ map: 942.46 kB[22m
2025-10-01T12:37:27.123214Z [2mdist/[22m[2massets/[22m[36mvendor-react-BJUTLwRx.js [39m[1m[33m1,010.25 kB[39m[22m[2m │ gzip: 289.03 kB[22m[2m │ map: 3,447.24 kB[22m
2025-10-01T12:37:27.123304Z [2mdist/[22m[2massets/[22m[36mvendor-other-BlNzYQKF.js [39m[1m[33m1,273.24 kB[39m[22m[2m │ gzip: 334.43 kB[22m[2m │ map: 5,121.47 kB[22m
2025-10-01T12:37:27.123396Z [32m✓ built in 43.36s[39m
2025-10-01T12:37:27.123486Z [33m
2025-10-01T12:37:27.123588Z (!) Some chunks are larger than 600 kB after minification. Consider:
2025-10-01T12:37:27.123686Z - Using dynamic import() to code-split the application
2025-10-01T12:37:27.123779Z - Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
2025-10-01T12:37:27.123879Z - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
2025-10-01T12:37:27.41775Z Finished
2025-10-01T12:37:28.426157Z Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T12:37:28.426854Z
2025-10-01T12:37:29.531619Z No wrangler.toml file found. Continuing.
2025-10-01T12:37:29.532526Z Found Functions directory at /functions. Uploading.
2025-10-01T12:37:29.538982Z ⛅️ wrangler 3.101.0
2025-10-01T12:37:29.53933Z -------------------
2025-10-01T12:37:30.540509Z ✨ Compiled Worker successfully
2025-10-01T12:37:31.635553Z Found \_routes.json in output directory. Uploading.
2025-10-01T12:37:31.647145Z Validating asset output directory
2025-10-01T12:37:34.662915Z Deploying your site to Cloudflare's global network...
2025-10-01T12:37:38.382227Z Parsed 20 valid header rules.
2025-10-01T12:37:39.755375Z Uploading... (198/200)
2025-10-01T12:37:40.476341Z Uploading... (199/200)
2025-10-01T12:37:40.549486Z Uploading... (200/200)
2025-10-01T12:37:40.549869Z ✨ Success! Uploaded 2 files (198 already uploaded) (1.09 sec)
2025-10-01T12:37:40.550082Z
2025-10-01T12:37:41.181825Z ✨ Upload complete!
2025-10-01T12:37:44.481999Z Skipping build output cache as it's not supported for your project
2025-10-01T12:37:45.822989Z Success: Assets published!
2025-10-01T12:37:48.24413Z Success: Your site was deployed!
=======
2025-10-01T20:37:01.052134Z	Cloning repository...
2025-10-01T20:37:02.403729Z	From https://github.com/dj-pearson/desmoines-ai-pulse
2025-10-01T20:37:02.404345Z	 * branch            ae64ebcc2474c04a8461d39340877a6f09716f60 -> FETCH_HEAD
2025-10-01T20:37:02.404456Z	
2025-10-01T20:37:02.504931Z	HEAD is now at ae64ebc CRITICAL: Force unregister all service workers and clear all caches on page load
2025-10-01T20:37:02.505466Z	
2025-10-01T20:37:02.582249Z	
2025-10-01T20:37:02.582805Z	Using v2 root directory strategy
2025-10-01T20:37:02.608662Z	Success: Finished cloning repository files
2025-10-01T20:37:03.579297Z	Restoring from dependencies cache
2025-10-01T20:37:03.596222Z	Restoring from build output cache
2025-10-01T20:37:04.810249Z	Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T20:37:04.811024Z	
2025-10-01T20:37:05.918565Z	No wrangler.toml file found. Continuing.
2025-10-01T20:37:05.996979Z	Detected the following tools from environment: nodejs@20.18.0, npm@10.9.2
2025-10-01T20:37:05.997648Z	Installing nodejs 20.18.0
2025-10-01T20:37:07.094566Z	Trying to update node-build... ok
2025-10-01T20:37:07.195785Z	To follow progress, use 'tail -f /tmp/node-build.20251001203707.496.log' or pass --verbose
2025-10-01T20:37:07.302247Z	Downloading node-v20.18.0-linux-x64.tar.gz...
2025-10-01T20:37:07.546979Z	-> https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz
2025-10-01T20:37:09.290385Z	
2025-10-01T20:37:09.290712Z	WARNING: node-v20.18.0-linux-x64 is in LTS Maintenance mode and nearing its end of life.
2025-10-01T20:37:09.290822Z	It only receives *critical* security updates, *critical* bug fixes and documentation updates.
2025-10-01T20:37:09.291002Z	
2025-10-01T20:37:09.291143Z	Installing node-v20.18.0-linux-x64...
2025-10-01T20:37:09.689969Z	Installed node-v20.18.0-linux-x64 to /opt/buildhome/.asdf/installs/nodejs/20.18.0
2025-10-01T20:37:09.690274Z	
2025-10-01T20:37:10.715346Z	Installing project dependencies: npm clean-install --progress=false
2025-10-01T20:37:16.860203Z	npm warn deprecated @types/dompurify@3.2.0: This is a stub types definition. dompurify provides its own type definitions, so you do not need this installed.
2025-10-01T20:37:17.352891Z	npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
2025-10-01T20:37:21.192356Z	npm warn deprecated three-mesh-bvh@0.7.8: Deprecated due to three.js version incompatibility. Please use v0.8.0, instead.
2025-10-01T20:37:39.134722Z	
2025-10-01T20:37:39.135286Z	added 695 packages, and audited 696 packages in 28s
2025-10-01T20:37:39.135762Z	
2025-10-01T20:37:39.136031Z	103 packages are looking for funding
2025-10-01T20:37:39.136157Z	  run `npm fund` for details
2025-10-01T20:37:39.156364Z	
2025-10-01T20:37:39.156993Z	6 vulnerabilities (3 low, 3 moderate)
2025-10-01T20:37:39.158213Z	
2025-10-01T20:37:39.158413Z	To address all issues, run:
2025-10-01T20:37:39.158576Z	  npm audit fix
2025-10-01T20:37:39.158715Z	
2025-10-01T20:37:39.158897Z	Run `npm audit` for details.
2025-10-01T20:37:39.178358Z	Executing user command: npm run build
2025-10-01T20:37:39.587027Z	
2025-10-01T20:37:39.587415Z	> vite_react_shadcn_ts@0.0.0 build
2025-10-01T20:37:39.587637Z	> vite build
2025-10-01T20:37:39.587784Z	
2025-10-01T20:37:39.87342Z	[36mvite v5.4.10 [32mbuilding for production...[36m[39m
2025-10-01T20:37:39.946386Z	transforming...
2025-10-01T20:37:56.869509Z	[32m✓[39m 4260 modules transformed.
2025-10-01T20:37:57.729089Z	rendering chunks...
2025-10-01T20:37:58.290133Z	computing gzip size...
2025-10-01T20:37:58.345529Z	[2mdist/[22m[32mindex.html                                   [39m[1m[2m   15.54 kB[22m[1m[22m[2m │ gzip:   4.21 kB[22m
2025-10-01T20:37:58.34593Z	[2mdist/[22m[2massets/[22m[35mvendor-other-Dgihpmma.css             [39m[1m[2m   15.04 kB[22m[1m[22m[2m │ gzip:   6.38 kB[22m
2025-10-01T20:37:58.346087Z	[2mdist/[22m[2massets/[22m[35mindex-IE542Gmw.css                    [39m[1m[2m  125.20 kB[22m[1m[22m[2m │ gzip:  19.50 kB[22m
2025-10-01T20:37:58.346641Z	[2mdist/[22m[2massets/[22m[36mvendor-ui-BQCqNqg0.js                 [39m[1m[2m    0.20 kB[22m[1m[22m[2m │ gzip:   0.16 kB[22m
2025-10-01T20:37:58.346733Z	[2mdist/[22m[2massets/[22m[36mskeleton-_3vtHd8J.js                  [39m[1m[2m    0.21 kB[22m[1m[22m[2m │ gzip:   0.18 kB[22m
2025-10-01T20:37:58.347109Z	[2mdist/[22m[2massets/[22m[36mseparator-H5gBcTdG.js                 [39m[1m[2m    0.37 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
2025-10-01T20:37:58.347252Z	[2mdist/[22m[2massets/[22m[36mlabel-DIxCeW1N.js                     [39m[1m[2m    0.37 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
2025-10-01T20:37:58.347579Z	[2mdist/[22m[2massets/[22m[36mclient-Ba9c360E.js                    [39m[1m[2m    0.41 kB[22m[1m[22m[2m │ gzip:   0.35 kB[22m
2025-10-01T20:37:58.347985Z	[2mdist/[22m[2massets/[22m[36mprogress-Cd0GIqoW.js                  [39m[1m[2m    0.44 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
2025-10-01T20:37:58.348202Z	[2mdist/[22m[2massets/[22m[36mtextarea-DmrmbNeT.js                  [39m[1m[2m    0.52 kB[22m[1m[22m[2m │ gzip:   0.34 kB[22m
2025-10-01T20:37:58.348297Z	[2mdist/[22m[2massets/[22m[36minput-C56wFs_k.js                     [39m[1m[2m    0.62 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
2025-10-01T20:37:58.348392Z	[2mdist/[22m[2massets/[22m[36mcheckbox-jysqfzOA.js                  [39m[1m[2m    0.67 kB[22m[1m[22m[2m │ gzip:   0.40 kB[22m
2025-10-01T20:37:58.348515Z	[2mdist/[22m[2massets/[22m[36mslider-DO_YwJiP.js                    [39m[1m[2m    0.75 kB[22m[1m[22m[2m │ gzip:   0.43 kB[22m
2025-10-01T20:37:58.348611Z	[2mdist/[22m[2massets/[22m[36mpopover-Dx8GHgOQ.js                   [39m[1m[2m    0.77 kB[22m[1m[22m[2m │ gzip:   0.42 kB[22m
2025-10-01T20:37:58.348738Z	[2mdist/[22m[2massets/[22m[36mbadge-CV5pvruU.js                     [39m[1m[2m    0.79 kB[22m[1m[22m[2m │ gzip:   0.41 kB[22m
2025-10-01T20:37:58.348862Z	[2mdist/[22m[2massets/[22m[36mswitch-Bnu0NRvI.js                    [39m[1m[2m    0.82 kB[22m[1m[22m[2m │ gzip:   0.44 kB[22m
2025-10-01T20:37:58.349133Z	[2mdist/[22m[2massets/[22m[36malert-C6MS5fsk.js                     [39m[1m[2m    0.99 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
2025-10-01T20:37:58.34929Z	[2mdist/[22m[2massets/[22m[36mtabs-CY38kn-K.js                      [39m[1m[2m    1.11 kB[22m[1m[22m[2m │ gzip:   0.47 kB[22m
2025-10-01T20:37:58.349396Z	[2mdist/[22m[2massets/[22m[36museProfile-C-mL3zpW.js                [39m[1m[2m    1.21 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
2025-10-01T20:37:58.349496Z	[2mdist/[22m[2massets/[22m[36merrorSuppression-C_Wr2-52.js          [39m[1m[2m    1.22 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
2025-10-01T20:37:58.349682Z	[2mdist/[22m[2massets/[22m[36mAIWriteup-L6NCqKMD.js                 [39m[1m[2m    1.30 kB[22m[1m[22m[2m │ gzip:   0.68 kB[22m
2025-10-01T20:37:58.349789Z	[2mdist/[22m[2massets/[22m[36mFAQSection-Dd_LKdYH.js                [39m[1m[2m    1.47 kB[22m[1m[22m[2m │ gzip:   0.73 kB[22m
2025-10-01T20:37:58.349914Z	[2mdist/[22m[2massets/[22m[36musePlaygrounds-qAHBPWNZ.js            [39m[1m[2m    1.53 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m
2025-10-01T20:37:58.350022Z	[2mdist/[22m[2massets/[22m[36museUserSubmittedEvents-BdAuQsn0.js    [39m[1m[2m    1.54 kB[22m[1m[22m[2m │ gzip:   0.62 kB[22m
2025-10-01T20:37:58.350115Z	[2mdist/[22m[2massets/[22m[36mtimezone-BrbU5BAl.js                  [39m[1m[2m    1.63 kB[22m[1m[22m[2m │ gzip:   0.64 kB[22m
2025-10-01T20:37:58.350209Z	[2mdist/[22m[2massets/[22m[36museAttractions-UX5n8DbY.js            [39m[1m[2m    1.64 kB[22m[1m[22m[2m │ gzip:   0.71 kB[22m
2025-10-01T20:37:58.350302Z	[2mdist/[22m[2massets/[22m[36museAuth-DP_gLh_R.js                   [39m[1m[2m    1.70 kB[22m[1m[22m[2m │ gzip:   0.77 kB[22m
2025-10-01T20:37:58.350392Z	[2mdist/[22m[2massets/[22m[36museSupabase-ywMUAw4q.js               [39m[1m[2m    1.82 kB[22m[1m[22m[2m │ gzip:   0.81 kB[22m
2025-10-01T20:37:58.350473Z	[2mdist/[22m[2massets/[22m[36mcalendar-BZ5HPWtF.js                  [39m[1m[2m    1.86 kB[22m[1m[22m[2m │ gzip:   0.82 kB[22m
2025-10-01T20:37:58.350558Z	[2mdist/[22m[2massets/[22m[36museEvents-CqLvR5px.js                 [39m[1m[2m    1.94 kB[22m[1m[22m[2m │ gzip:   0.85 kB[22m
2025-10-01T20:37:58.350652Z	[2mdist/[22m[2massets/[22m[36malert-dialog-D0A9uaN_.js              [39m[1m[2m    2.03 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
2025-10-01T20:37:58.350739Z	[2mdist/[22m[2massets/[22m[36mNotFound-BE-__TmX.js                  [39m[1m[2m    2.04 kB[22m[1m[22m[2m │ gzip:   0.93 kB[22m
2025-10-01T20:37:58.350827Z	[2mdist/[22m[2massets/[22m[36mloading-skeleton-ByJ9D8Em.js          [39m[1m[2m    2.11 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
2025-10-01T20:37:58.350933Z	[2mdist/[22m[2massets/[22m[36mdialog-BDDlkyWa.js                    [39m[1m[2m    2.18 kB[22m[1m[22m[2m │ gzip:   0.86 kB[22m
2025-10-01T20:37:58.351034Z	[2mdist/[22m[2massets/[22m[36museCampaigns-DE4397LU.js              [39m[1m[2m    2.25 kB[22m[1m[22m[2m │ gzip:   0.88 kB[22m
2025-10-01T20:37:58.351117Z	[2mdist/[22m[2massets/[22m[36museSocialFeatures-CpYSxrJ2.js         [39m[1m[2m    2.28 kB[22m[1m[22m[2m │ gzip:   0.85 kB[22m
2025-10-01T20:37:58.351292Z	[2mdist/[22m[2massets/[22m[36mperformance-fu47ZySA.js               [39m[1m[2m    2.34 kB[22m[1m[22m[2m │ gzip:   1.03 kB[22m
2025-10-01T20:37:58.351391Z	[2mdist/[22m[2massets/[22m[36mselect-fZXNQAzY.js                    [39m[1m[2m    2.97 kB[22m[1m[22m[2m │ gzip:   1.09 kB[22m
2025-10-01T20:37:58.351488Z	[2mdist/[22m[2massets/[22m[36museRestaurants-DuZs9VhA.js            [39m[1m[2m    3.25 kB[22m[1m[22m[2m │ gzip:   1.16 kB[22m
2025-10-01T20:37:58.351579Z	[2mdist/[22m[2massets/[22m[36mEventPhotoUpload-3dqVwqm2.js          [39m[1m[2m    3.47 kB[22m[1m[22m[2m │ gzip:   1.56 kB[22m
2025-10-01T20:37:58.351666Z	[2mdist/[22m[2massets/[22m[36museArticles-CF0wNbT5.js               [39m[1m[2m    3.49 kB[22m[1m[22m[2m │ gzip:   1.15 kB[22m
2025-10-01T20:37:58.35175Z	[2mdist/[22m[2massets/[22m[36mCampaignDashboard-aYywL14G.js         [39m[1m[2m    3.83 kB[22m[1m[22m[2m │ gzip:   1.26 kB[22m
2025-10-01T20:37:58.351833Z	[2mdist/[22m[2massets/[22m[36mSEOHead-CSjCNNkj.js                   [39m[1m[2m    4.55 kB[22m[1m[22m[2m │ gzip:   1.50 kB[22m
2025-10-01T20:37:58.351944Z	[2mdist/[22m[2massets/[22m[36mLocalSEO-CBN9nbUW.js                  [39m[1m[2m    4.98 kB[22m[1m[22m[2m │ gzip:   1.60 kB[22m
2025-10-01T20:37:58.352036Z	[2mdist/[22m[2massets/[22m[36museCommunityFeatures-9RcJAPfS.js      [39m[1m[2m    5.13 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
2025-10-01T20:37:58.352133Z	[2mdist/[22m[2massets/[22m[36mShareDialog-DIc7Lbcg.js               [39m[1m[2m    5.18 kB[22m[1m[22m[2m │ gzip:   2.50 kB[22m
2025-10-01T20:37:58.352236Z	[2mdist/[22m[2massets/[22m[36mEnhancedLocalSEO-BdF5njbS.js          [39m[1m[2m    5.33 kB[22m[1m[22m[2m │ gzip:   1.66 kB[22m
2025-10-01T20:37:58.352327Z	[2mdist/[22m[2massets/[22m[36mWeekendPage-BT0Oqbwv.js               [39m[1m[2m    5.61 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
2025-10-01T20:37:58.352413Z	[2mdist/[22m[2massets/[22m[36mAttractionDetails-CPjZjCfs.js         [39m[1m[2m    6.15 kB[22m[1m[22m[2m │ gzip:   2.22 kB[22m
2025-10-01T20:37:58.352501Z	[2mdist/[22m[2massets/[22m[36mPlaygroundDetails-CzxBTMzY.js         [39m[1m[2m    6.53 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
2025-10-01T20:37:58.352587Z	[2mdist/[22m[2massets/[22m[36mEventsToday-CyJoujSD.js               [39m[1m[2m    6.77 kB[22m[1m[22m[2m │ gzip:   2.30 kB[22m
2025-10-01T20:37:58.352674Z	[2mdist/[22m[2massets/[22m[36mEventCard-BZBtdbew.js                 [39m[1m[2m    7.37 kB[22m[1m[22m[2m │ gzip:   2.45 kB[22m
2025-10-01T20:37:58.35276Z	[2mdist/[22m[2massets/[22m[36mArticleDetails-FEL8odO4.js            [39m[1m[2m    7.43 kB[22m[1m[22m[2m │ gzip:   2.28 kB[22m
2025-10-01T20:37:58.352862Z	[2mdist/[22m[2massets/[22m[36mAuth-D389IXXH.js                      [39m[1m[2m    7.66 kB[22m[1m[22m[2m │ gzip:   2.44 kB[22m
2025-10-01T20:37:58.353032Z	[2mdist/[22m[2massets/[22m[36mNeighborhoodsPage-u43s91Z4.js         [39m[1m[2m    7.77 kB[22m[1m[22m[2m │ gzip:   2.50 kB[22m
2025-10-01T20:37:58.353132Z	[2mdist/[22m[2massets/[22m[36mAttractions-DU0bHXJq.js               [39m[1m[2m    8.28 kB[22m[1m[22m[2m │ gzip:   2.84 kB[22m
2025-10-01T20:37:58.353219Z	[2mdist/[22m[2massets/[22m[36mMonthlyEventsPage-T2otx71N.js         [39m[1m[2m    8.35 kB[22m[1m[22m[2m │ gzip:   2.80 kB[22m
2025-10-01T20:37:58.35331Z	[2mdist/[22m[2massets/[22m[36mEventsByLocation-BDklEcgP.js          [39m[1m[2m    8.90 kB[22m[1m[22m[2m │ gzip:   3.01 kB[22m
2025-10-01T20:37:58.353396Z	[2mdist/[22m[2massets/[22m[36mGuidesPage-Cvz0j2QX.js                [39m[1m[2m    8.99 kB[22m[1m[22m[2m │ gzip:   2.83 kB[22m
2025-10-01T20:37:58.353482Z	[2mdist/[22m[2massets/[22m[36mEventsThisWeekend-bHvNI3os.js         [39m[1m[2m    9.04 kB[22m[1m[22m[2m │ gzip:   2.88 kB[22m
2025-10-01T20:37:58.353575Z	[2mdist/[22m[2massets/[22m[36mAdminArticleEditor-BjuBsTZh.js        [39m[1m[2m    9.50 kB[22m[1m[22m[2m │ gzip:   3.03 kB[22m
2025-10-01T20:37:58.353663Z	[2mdist/[22m[2massets/[22m[36mArticles-BqVcWpn-.js                  [39m[1m[2m    9.59 kB[22m[1m[22m[2m │ gzip:   3.09 kB[22m
2025-10-01T20:37:58.353766Z	[2mdist/[22m[2massets/[22m[36mPlaygrounds-BSQQkzuw.js               [39m[1m[2m   10.38 kB[22m[1m[22m[2m │ gzip:   3.53 kB[22m
2025-10-01T20:37:58.353883Z	[2mdist/[22m[2massets/[22m[36mRestaurantsPage-Dj5qBusM.js           [39m[1m[2m   10.47 kB[22m[1m[22m[2m │ gzip:   3.44 kB[22m
2025-10-01T20:37:58.353977Z	[2mdist/[22m[2massets/[22m[36mSmartCalendarIntegration-CX_emAIh.js  [39m[1m[2m   11.34 kB[22m[1m[22m[2m │ gzip:   3.26 kB[22m
2025-10-01T20:37:58.354068Z	[2mdist/[22m[2massets/[22m[36mProfile-C_sXUECe.js                   [39m[1m[2m   11.49 kB[22m[1m[22m[2m │ gzip:   3.27 kB[22m
2025-10-01T20:37:58.354176Z	[2mdist/[22m[2massets/[22m[36mRestaurantDetails-C6LGE5f4.js         [39m[1m[2m   14.77 kB[22m[1m[22m[2m │ gzip:   4.06 kB[22m
2025-10-01T20:37:58.354274Z	[2mdist/[22m[2massets/[22m[36museEventSocial-DYn69qfA.js            [39m[1m[2m   14.91 kB[22m[1m[22m[2m │ gzip:   4.45 kB[22m
2025-10-01T20:37:58.354367Z	[2mdist/[22m[2massets/[22m[36mUserDashboard-Bhkv-mYK.js             [39m[1m[2m   15.32 kB[22m[1m[22m[2m │ gzip:   4.38 kB[22m
2025-10-01T20:37:58.354462Z	[2mdist/[22m[2massets/[22m[36mAdvertise-D0clKQjJ.js                 [39m[1m[2m   18.28 kB[22m[1m[22m[2m │ gzip:   4.82 kB[22m
2025-10-01T20:37:58.354566Z	[2mdist/[22m[2massets/[22m[36mEventsPage-Bpaw56aw.js                [39m[1m[2m   18.56 kB[22m[1m[22m[2m │ gzip:   5.84 kB[22m
2025-10-01T20:37:58.354658Z	[2mdist/[22m[2massets/[22m[36mGamification-CIjDEho7.js              [39m[1m[2m   18.88 kB[22m[1m[22m[2m │ gzip:   5.05 kB[22m
2025-10-01T20:37:58.354748Z	[2mdist/[22m[2massets/[22m[36mNeighborhoodPage-CJDU9Gai.js          [39m[1m[2m   18.95 kB[22m[1m[22m[2m │ gzip:   5.31 kB[22m
2025-10-01T20:37:58.354859Z	[2mdist/[22m[2massets/[22m[36mIowaStateFairPage-CBOuMj2e.js         [39m[1m[2m   19.16 kB[22m[1m[22m[2m │ gzip:   5.19 kB[22m
2025-10-01T20:37:58.354967Z	[2mdist/[22m[2massets/[22m[36mSocial-B9YKu-pV.js                    [39m[1m[2m   22.10 kB[22m[1m[22m[2m │ gzip:   5.15 kB[22m
2025-10-01T20:37:58.355073Z	[2mdist/[22m[2massets/[22m[36mindex-uLML1zLu.js                     [39m[1m[2m   22.75 kB[22m[1m[22m[2m │ gzip:   7.16 kB[22m
2025-10-01T20:37:58.355165Z	[2mdist/[22m[2massets/[22m[36mAdvancedSearchPage-D63-emko.js        [39m[1m[2m   24.40 kB[22m[1m[22m[2m │ gzip:   6.53 kB[22m
2025-10-01T20:37:58.355259Z	[2mdist/[22m[2massets/[22m[36mFooter-pmf9r5Il.js                    [39m[1m[2m   25.39 kB[22m[1m[22m[2m │ gzip:   6.98 kB[22m
2025-10-01T20:37:58.355367Z	[2mdist/[22m[2massets/[22m[36mRestaurants-iypKiBH3.js               [39m[1m[2m   26.38 kB[22m[1m[22m[2m │ gzip:   7.24 kB[22m
2025-10-01T20:37:58.355468Z	[2mdist/[22m[2massets/[22m[36mBusinessPartnership-D0G0B0LO.js       [39m[1m[2m   27.18 kB[22m[1m[22m[2m │ gzip:   6.13 kB[22m
2025-10-01T20:37:58.355566Z	[2mdist/[22m[2massets/[22m[36mRealTimePage-BiFsatUt.js              [39m[1m[2m   29.29 kB[22m[1m[22m[2m │ gzip:   7.41 kB[22m
2025-10-01T20:37:58.355661Z	[2mdist/[22m[2massets/[22m[36mEventDetails-BJl7EpP7.js              [39m[1m[2m   29.66 kB[22m[1m[22m[2m │ gzip:   7.93 kB[22m
2025-10-01T20:37:58.355753Z	[2mdist/[22m[2massets/[22m[36mvendor-query-DyvpetkW.js              [39m[1m[2m   34.20 kB[22m[1m[22m[2m │ gzip:  10.13 kB[22m
2025-10-01T20:37:58.355856Z	[2mdist/[22m[2massets/[22m[36mvendor-date-D3wHQ-5c.js               [39m[1m[2m   36.51 kB[22m[1m[22m[2m │ gzip:  10.64 kB[22m
2025-10-01T20:37:58.355955Z	[2mdist/[22m[2massets/[22m[36mIndex-DWoxohmx.js                     [39m[1m[2m   97.00 kB[22m[1m[22m[2m │ gzip:  25.17 kB[22m
2025-10-01T20:37:58.356053Z	[2mdist/[22m[2massets/[22m[36mvendor-supabase-BjP5TmGq.js           [39m[1m[2m  115.31 kB[22m[1m[22m[2m │ gzip:  31.62 kB[22m
2025-10-01T20:37:58.356147Z	[2mdist/[22m[2massets/[22m[36mAdmin-BCIhdnlN.js                     [39m[1m[2m  324.25 kB[22m[1m[22m[2m │ gzip:  69.25 kB[22m
2025-10-01T20:37:58.356233Z	[2mdist/[22m[2massets/[22m[36mvendor-react-BIH5Hej3.js              [39m[1m[33m1,295.65 kB[39m[22m[2m │ gzip: 303.31 kB[22m
2025-10-01T20:37:58.356322Z	[2mdist/[22m[2massets/[22m[36mvendor-other-oDKqkdDi.js              [39m[1m[33m1,301.38 kB[39m[22m[2m │ gzip: 353.99 kB[22m
2025-10-01T20:37:58.356423Z	[32m✓ built in 18.45s[39m
2025-10-01T20:37:58.356516Z	[33m
2025-10-01T20:37:58.3566Z	(!) Some chunks are larger than 600 kB after minification. Consider:
2025-10-01T20:37:58.356693Z	- Using dynamic import() to code-split the application
2025-10-01T20:37:58.356781Z	- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
2025-10-01T20:37:58.356884Z	- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
2025-10-01T20:37:58.50068Z	Finished
2025-10-01T20:37:59.433024Z	Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T20:37:59.433522Z	
2025-10-01T20:38:00.545902Z	No wrangler.toml file found. Continuing.
2025-10-01T20:38:00.546629Z	Found Functions directory at /functions. Uploading.
2025-10-01T20:38:00.552634Z	 ⛅️ wrangler 3.101.0
2025-10-01T20:38:00.55297Z	-------------------
2025-10-01T20:38:01.474088Z	✨ Compiled Worker successfully
2025-10-01T20:38:02.576022Z	Found _routes.json in output directory. Uploading.
2025-10-01T20:38:02.587352Z	Validating asset output directory
2025-10-01T20:38:05.424355Z	Deploying your site to Cloudflare's global network...
2025-10-01T20:38:08.15901Z	Parsed 20 valid header rules.
2025-10-01T20:38:09.461062Z	Uploading... (111/114)
2025-10-01T20:38:10.139881Z	Uploading... (112/114)
2025-10-01T20:38:10.32804Z	Uploading... (113/114)
2025-10-01T20:38:10.976226Z	Uploading... (114/114)
2025-10-01T20:38:10.976495Z	✨ Success! Uploaded 3 files (111 already uploaded) (1.86 sec)
2025-10-01T20:38:10.976611Z	
2025-10-01T20:38:11.637966Z	✨ Upload complete!
2025-10-01T20:38:14.993437Z	Uploading to dependency cache
2025-10-01T20:38:15.047275Z	Skipping build output cache as it's not supported for your project
2025-10-01T20:38:16.426789Z	Success: Dependencies uploaded to build cache.
2025-10-01T20:38:17.909339Z	Success: Assets published!
2025-10-01T20:38:21.780107Z	Success: Your site was deployed!
>>>>>>> e95a97c (Update logs and add SEO duplication guide)
