2025-10-01T04:10:59.344489Z Cloning repository...
2025-10-01T04:11:00.600958Z From https://github.com/dj-pearson/desmoines-ai-pulse
2025-10-01T04:11:00.601709Z * branch 72d9d8572f5c60578addcc63db021df7a7c372b3 -> FETCH_HEAD
2025-10-01T04:11:00.601845Z
2025-10-01T04:11:00.69772Z HEAD is now at 72d9d85 Update console and deploy logs; add duplicate preload warning for logo asset
2025-10-01T04:11:00.698223Z
2025-10-01T04:11:00.777158Z
2025-10-01T04:11:00.777705Z Using v2 root directory strategy
2025-10-01T04:11:00.800172Z Success: Finished cloning repository files
2025-10-01T04:11:01.600498Z Restoring from dependencies cache
2025-10-01T04:11:01.616929Z Restoring from build output cache
2025-10-01T04:11:03.307768Z Success: Dependencies restored from build cache.
2025-10-01T04:11:04.379504Z Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T04:11:04.380154Z
2025-10-01T04:11:05.482478Z No wrangler.toml file found. Continuing.
2025-10-01T04:11:05.560689Z Detected the following tools from environment: nodejs@20.18.0, npm@10.9.2
2025-10-01T04:11:05.561266Z Installing nodejs 20.18.0
2025-10-01T04:11:06.619332Z Trying to update node-build... ok
2025-10-01T04:11:06.713094Z To follow progress, use 'tail -f /tmp/node-build.20251001041106.502.log' or pass --verbose
2025-10-01T04:11:06.81191Z Downloading node-v20.18.0-linux-x64.tar.gz...
2025-10-01T04:11:07.029407Z -> https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz
2025-10-01T04:11:08.83224Z
2025-10-01T04:11:08.832533Z WARNING: node-v20.18.0-linux-x64 is in LTS Maintenance mode and nearing its end of life.
2025-10-01T04:11:08.83269Z It only receives *critical* security updates, *critical\* bug fixes and documentation updates.
2025-10-01T04:11:08.832805Z
2025-10-01T04:11:08.832975Z Installing node-v20.18.0-linux-x64...
2025-10-01T04:11:09.240609Z Installed node-v20.18.0-linux-x64 to /opt/buildhome/.asdf/installs/nodejs/20.18.0
2025-10-01T04:11:09.240941Z
2025-10-01T04:11:10.236137Z Installing project dependencies: npm clean-install --progress=false
2025-10-01T04:11:13.45999Z npm warn deprecated @types/dompurify@3.2.0: This is a stub types definition. dompurify provides its own type definitions, so you do not need this installed.
2025-10-01T04:11:14.978705Z npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
2025-10-01T04:11:19.349514Z npm warn deprecated three-mesh-bvh@0.7.8: Deprecated due to three.js version incompatibility. Please use v0.8.0, instead.
2025-10-01T04:11:37.246913Z
2025-10-01T04:11:37.247233Z added 695 packages, and audited 696 packages in 27s
2025-10-01T04:11:37.247421Z
2025-10-01T04:11:37.247569Z 103 packages are looking for funding
2025-10-01T04:11:37.247794Z run `npm fund` for details
2025-10-01T04:11:37.271472Z
2025-10-01T04:11:37.271778Z 6 vulnerabilities (3 low, 3 moderate)
2025-10-01T04:11:37.271945Z
2025-10-01T04:11:37.272113Z To address all issues, run:
2025-10-01T04:11:37.272239Z npm audit fix
2025-10-01T04:11:37.272366Z
2025-10-01T04:11:37.272543Z Run `npm audit` for details.
2025-10-01T04:11:37.306866Z Executing user command: npm run build
2025-10-01T04:11:37.732128Z
2025-10-01T04:11:37.732343Z > vite_react_shadcn_ts@0.0.0 build
2025-10-01T04:11:37.732578Z > vite build
2025-10-01T04:11:37.732793Z
2025-10-01T04:11:38.019082Z [36mvite v5.4.10 [32mbuilding for production...[36m[39m
2025-10-01T04:11:38.09855Z transforming...
2025-10-01T04:11:54.955389Z [32m✓[39m 4260 modules transformed.
2025-10-01T04:11:56.730242Z rendering chunks...
2025-10-01T04:12:15.453732Z computing gzip size...
2025-10-01T04:12:15.652837Z [2mdist/[22m[2massets/[22m[32mApp-BsTyPTsK.tsx [39m[1m[2m 6.76 kB[22m[1m[22m
2025-10-01T04:12:15.65313Z [2mdist/[22m[32mindex.html [39m[1m[2m 15.75 kB[22m[1m[22m[2m │ gzip: 5.24 kB[22m
2025-10-01T04:12:15.653307Z [2mdist/[22m[2massets/[22m[35mvendor-other-Dgihpmma.css [39m[1m[2m 15.04 kB[22m[1m[22m[2m │ gzip: 6.38 kB[22m
2025-10-01T04:12:15.653447Z [2mdist/[22m[2massets/[22m[35mindex-IE542Gmw.css [39m[1m[2m 125.20 kB[22m[1m[22m[2m │ gzip: 19.50 kB[22m
2025-10-01T04:12:15.653598Z [2mdist/[22m[2massets/[22m[36mvendor-ui-ByoYm48K.js [39m[1m[2m 0.25 kB[22m[1m[22m[2m │ gzip: 0.21 kB[22m[2m │ map: 1.25 kB[22m
2025-10-01T04:12:15.653829Z [2mdist/[22m[2massets/[22m[36mskeleton-mGuZGEtJ.js [39m[1m[2m 0.26 kB[22m[1m[22m[2m │ gzip: 0.22 kB[22m[2m │ map: 0.55 kB[22m
2025-10-01T04:12:15.654071Z [2mdist/[22m[2massets/[22m[36mseparator-Dae1tIj8.js [39m[1m[2m 0.42 kB[22m[1m[22m[2m │ gzip: 0.31 kB[22m[2m │ map: 1.29 kB[22m
2025-10-01T04:12:15.654205Z [2mdist/[22m[2massets/[22m[36mlabel-DbpYWBHN.js [39m[1m[2m 0.42 kB[22m[1m[22m[2m │ gzip: 0.30 kB[22m[2m │ map: 1.17 kB[22m
2025-10-01T04:12:15.654326Z [2mdist/[22m[2massets/[22m[36mclient-CuNO40hr.js [39m[1m[2m 0.44 kB[22m[1m[22m[2m │ gzip: 0.38 kB[22m[2m │ map: 1.14 kB[22m
2025-10-01T04:12:15.654428Z [2mdist/[22m[2massets/[22m[36mprogress-DZNUXRMr.js [39m[1m[2m 0.48 kB[22m[1m[22m[2m │ gzip: 0.36 kB[22m[2m │ map: 1.38 kB[22m
2025-10-01T04:12:15.654527Z [2mdist/[22m[2massets/[22m[36mtextarea-BziXp-7B.js [39m[1m[2m 0.57 kB[22m[1m[22m[2m │ gzip: 0.38 kB[22m[2m │ map: 1.13 kB[22m
2025-10-01T04:12:15.654668Z [2mdist/[22m[2massets/[22m[36minput-e-4gUWzU.js [39m[1m[2m 0.66 kB[22m[1m[22m[2m │ gzip: 0.41 kB[22m[2m │ map: 1.16 kB[22m
2025-10-01T04:12:15.654791Z [2mdist/[22m[2massets/[22m[36mcheckbox-Bq650Bpd.js [39m[1m[2m 0.72 kB[22m[1m[22m[2m │ gzip: 0.43 kB[22m[2m │ map: 1.63 kB[22m
2025-10-01T04:12:15.65496Z [2mdist/[22m[2massets/[22m[36mslider-B3N1sq2i.js [39m[1m[2m 0.80 kB[22m[1m[22m[2m │ gzip: 0.47 kB[22m[2m │ map: 1.71 kB[22m
2025-10-01T04:12:15.655098Z [2mdist/[22m[2massets/[22m[36mpopover-BBPRIcpx.js [39m[1m[2m 0.82 kB[22m[1m[22m[2m │ gzip: 0.45 kB[22m[2m │ map: 1.83 kB[22m
2025-10-01T04:12:15.655206Z [2mdist/[22m[2massets/[22m[36mbadge-DZ0-1i3v.js [39m[1m[2m 0.83 kB[22m[1m[22m[2m │ gzip: 0.45 kB[22m[2m │ map: 1.70 kB[22m
2025-10-01T04:12:15.65531Z [2mdist/[22m[2massets/[22m[36mswitch-Ds0ODq3k.js [39m[1m[2m 0.86 kB[22m[1m[22m[2m │ gzip: 0.48 kB[22m[2m │ map: 1.63 kB[22m
2025-10-01T04:12:15.65542Z [2mdist/[22m[2massets/[22m[36malert-2sReonCP.js [39m[1m[2m 1.02 kB[22m[1m[22m[2m │ gzip: 0.54 kB[22m[2m │ map: 2.47 kB[22m
2025-10-01T04:12:15.655528Z [2mdist/[22m[2massets/[22m[36merrorSuppression-LVnJe3hs.js [39m[1m[2m 1.08 kB[22m[1m[22m[2m │ gzip: 0.55 kB[22m[2m │ map: 4.33 kB[22m
2025-10-01T04:12:15.655634Z [2mdist/[22m[2massets/[22m[36museProfile-ar63XZr0.js [39m[1m[2m 1.09 kB[22m[1m[22m[2m │ gzip: 0.58 kB[22m[2m │ map: 4.51 kB[22m
2025-10-01T04:12:15.655731Z [2mdist/[22m[2massets/[22m[36mtabs-Do7v7h8b.js [39m[1m[2m 1.16 kB[22m[1m[22m[2m │ gzip: 0.51 kB[22m[2m │ map: 2.70 kB[22m
2025-10-01T04:12:15.655826Z [2mdist/[22m[2massets/[22m[36mAIWriteup-Cz2Aju73.js [39m[1m[2m 1.35 kB[22m[1m[22m[2m │ gzip: 0.72 kB[22m[2m │ map: 3.15 kB[22m
2025-10-01T04:12:15.655957Z [2mdist/[22m[2massets/[22m[36musePlaygrounds-CcQa7Amw.js [39m[1m[2m 1.39 kB[22m[1m[22m[2m │ gzip: 0.65 kB[22m[2m │ map: 5.68 kB[22m
2025-10-01T04:12:15.656066Z [2mdist/[22m[2massets/[22m[36museSocialFeatures-C6u7xR9M.js [39m[1m[2m 1.48 kB[22m[1m[22m[2m │ gzip: 0.66 kB[22m[2m │ map: 9.52 kB[22m
2025-10-01T04:12:15.656185Z [2mdist/[22m[2massets/[22m[36museAuth-QYBUzbbh.js [39m[1m[2m 1.49 kB[22m[1m[22m[2m │ gzip: 0.73 kB[22m[2m │ map: 6.23 kB[22m
2025-10-01T04:12:15.656315Z [2mdist/[22m[2massets/[22m[36museAttractions-D1JZsT8f.js [39m[1m[2m 1.50 kB[22m[1m[22m[2m │ gzip: 0.70 kB[22m[2m │ map: 6.15 kB[22m
2025-10-01T04:12:15.65643Z [2mdist/[22m[2massets/[22m[36mFAQSection-C13Mv9Kx.js [39m[1m[2m 1.51 kB[22m[1m[22m[2m │ gzip: 0.77 kB[22m[2m │ map: 4.75 kB[22m
2025-10-01T04:12:15.656511Z [2mdist/[22m[2massets/[22m[36mtimezone-BBSHPwJT.js [39m[1m[2m 1.59 kB[22m[1m[22m[2m │ gzip: 0.63 kB[22m[2m │ map: 7.93 kB[22m
2025-10-01T04:12:15.656576Z [2mdist/[22m[2massets/[22m[36museUserSubmittedEvents-BsAcSf-1.js [39m[1m[2m 1.61 kB[22m[1m[22m[2m │ gzip: 0.65 kB[22m[2m │ map: 6.58 kB[22m
2025-10-01T04:12:15.656635Z [2mdist/[22m[2massets/[22m[36museEvents-CIimIxwo.js [39m[1m[2m 1.68 kB[22m[1m[22m[2m │ gzip: 0.79 kB[22m[2m │ map: 7.28 kB[22m
2025-10-01T04:12:15.656776Z [2mdist/[22m[2massets/[22m[36museSupabase-\_N6Yn2UJ.js [39m[1m[2m 1.78 kB[22m[1m[22m[2m │ gzip: 0.80 kB[22m[2m │ map: 9.68 kB[22m
2025-10-01T04:12:15.656903Z [2mdist/[22m[2massets/[22m[36mcalendar-BlzaO1V7.js [39m[1m[2m 1.91 kB[22m[1m[22m[2m │ gzip: 0.85 kB[22m[2m │ map: 3.97 kB[22m
2025-10-01T04:12:15.657002Z [2mdist/[22m[2massets/[22m[36mperformance-DRNioTBP.js [39m[1m[2m 1.97 kB[22m[1m[22m[2m │ gzip: 0.89 kB[22m[2m │ map: 9.57 kB[22m
2025-10-01T04:12:15.6571Z [2mdist/[22m[2massets/[22m[36mNotFound-fcgUXwQw.js [39m[1m[2m 2.00 kB[22m[1m[22m[2m │ gzip: 0.92 kB[22m[2m │ map: 4.16 kB[22m
2025-10-01T04:12:15.657215Z [2mdist/[22m[2massets/[22m[36malert-dialog-CVSL9VBV.js [39m[1m[2m 2.08 kB[22m[1m[22m[2m │ gzip: 0.78 kB[22m[2m │ map: 6.41 kB[22m
2025-10-01T04:12:15.657437Z [2mdist/[22m[2massets/[22m[36mloading-skeleton-Dz2JPz5U.js [39m[1m[2m 2.16 kB[22m[1m[22m[2m │ gzip: 0.80 kB[22m[2m │ map: 8.21 kB[22m
2025-10-01T04:12:15.657548Z [2mdist/[22m[2massets/[22m[36mdialog-BQ_a3x37.js [39m[1m[2m 2.23 kB[22m[1m[22m[2m │ gzip: 0.89 kB[22m[2m │ map: 5.48 kB[22m
2025-10-01T04:12:15.657636Z [2mdist/[22m[2massets/[22m[36museCampaigns-CcpIkXym.js [39m[1m[2m 2.31 kB[22m[1m[22m[2m │ gzip: 0.91 kB[22m[2m │ map: 8.66 kB[22m
2025-10-01T04:12:15.657698Z [2mdist/[22m[2massets/[22m[36mselect-De5Ji6QN.js [39m[1m[2m 3.00 kB[22m[1m[22m[2m │ gzip: 1.11 kB[22m[2m │ map: 8.01 kB[22m
2025-10-01T04:12:15.657756Z [2mdist/[22m[2massets/[22m[36museRestaurants-B9D5ItOR.js [39m[1m[2m 3.05 kB[22m[1m[22m[2m │ gzip: 1.12 kB[22m[2m │ map: 12.18 kB[22m
2025-10-01T04:12:15.657883Z [2mdist/[22m[2massets/[22m[36museArticles-JSsQoSYB.js [39m[1m[2m 3.21 kB[22m[1m[22m[2m │ gzip: 1.11 kB[22m[2m │ map: 11.38 kB[22m
2025-10-01T04:12:15.658004Z [2mdist/[22m[2massets/[22m[36mEventPhotoUpload-BhTcVBf0.js [39m[1m[2m 3.48 kB[22m[1m[22m[2m │ gzip: 1.58 kB[22m[2m │ map: 11.37 kB[22m
2025-10-01T04:12:15.658098Z [2mdist/[22m[2massets/[22m[36mCampaignDashboard-p_oPsR8C.js [39m[1m[2m 3.89 kB[22m[1m[22m[2m │ gzip: 1.29 kB[22m[2m │ map: 8.94 kB[22m
2025-10-01T04:12:15.658198Z [2mdist/[22m[2massets/[22m[36museCommunityFeatures-BhqV23bJ.js [39m[1m[2m 4.55 kB[22m[1m[22m[2m │ gzip: 1.50 kB[22m[2m │ map: 17.48 kB[22m
2025-10-01T04:12:15.65831Z [2mdist/[22m[2massets/[22m[36mSEOHead-BXairrZU.js [39m[1m[2m 4.58 kB[22m[1m[22m[2m │ gzip: 1.52 kB[22m[2m │ map: 12.43 kB[22m
2025-10-01T04:12:15.658385Z [2mdist/[22m[2massets/[22m[36mLocalSEO-CToWAuBV.js [39m[1m[2m 5.02 kB[22m[1m[22m[2m │ gzip: 1.62 kB[22m[2m │ map: 12.41 kB[22m
2025-10-01T04:12:15.658476Z [2mdist/[22m[2massets/[22m[36mShareDialog-ByVb1X5c.js [39m[1m[2m 5.18 kB[22m[1m[22m[2m │ gzip: 2.51 kB[22m[2m │ map: 11.47 kB[22m
2025-10-01T04:12:15.658569Z [2mdist/[22m[2massets/[22m[36mEnhancedLocalSEO-dugKrai4.js [39m[1m[2m 5.37 kB[22m[1m[22m[2m │ gzip: 1.69 kB[22m[2m │ map: 16.66 kB[22m
2025-10-01T04:12:15.65864Z [2mdist/[22m[2massets/[22m[36mWeekendPage-C3wYCQre.js [39m[1m[2m 5.56 kB[22m[1m[22m[2m │ gzip: 2.16 kB[22m[2m │ map: 14.76 kB[22m
2025-10-01T04:12:15.65872Z [2mdist/[22m[2massets/[22m[36mAttractionDetails-fsl6KQK9.js [39m[1m[2m 6.13 kB[22m[1m[22m[2m │ gzip: 2.23 kB[22m[2m │ map: 16.30 kB[22m
2025-10-01T04:12:15.658823Z [2mdist/[22m[2massets/[22m[36mPlaygroundDetails-BwD0jHKz.js [39m[1m[2m 6.51 kB[22m[1m[22m[2m │ gzip: 2.17 kB[22m[2m │ map: 17.43 kB[22m
2025-10-01T04:12:15.658942Z [2mdist/[22m[2massets/[22m[36mEventsToday-M9NVRjii.js [39m[1m[2m 6.72 kB[22m[1m[22m[2m │ gzip: 2.30 kB[22m[2m │ map: 13.94 kB[22m
2025-10-01T04:12:15.659113Z [2mdist/[22m[2massets/[22m[36mEventCard-n4ZkLL7w.js [39m[1m[2m 7.14 kB[22m[1m[22m[2m │ gzip: 2.39 kB[22m[2m │ map: 23.52 kB[22m
2025-10-01T04:12:15.659259Z [2mdist/[22m[2massets/[22m[36mArticleDetails-CqkDoRzf.js [39m[1m[2m 7.48 kB[22m[1m[22m[2m │ gzip: 2.32 kB[22m[2m │ map: 18.28 kB[22m
2025-10-01T04:12:15.659358Z [2mdist/[22m[2massets/[22m[36mAuth-BlOkecQ0.js [39m[1m[2m 7.71 kB[22m[1m[22m[2m │ gzip: 2.46 kB[22m[2m │ map: 21.63 kB[22m
2025-10-01T04:12:15.659477Z [2mdist/[22m[2massets/[22m[36mNeighborhoodsPage-BhHTWR_d.js [39m[1m[2m 7.82 kB[22m[1m[22m[2m │ gzip: 2.54 kB[22m[2m │ map: 14.84 kB[22m
2025-10-01T04:12:15.659575Z [2mdist/[22m[2massets/[22m[36mAttractions-ByD639hx.js [39m[1m[2m 8.35 kB[22m[1m[22m[2m │ gzip: 2.85 kB[22m[2m │ map: 22.36 kB[22m
2025-10-01T04:12:15.659682Z [2mdist/[22m[2massets/[22m[36mMonthlyEventsPage-CEJdTEZv.js [39m[1m[2m 8.39 kB[22m[1m[22m[2m │ gzip: 2.84 kB[22m[2m │ map: 20.27 kB[22m
2025-10-01T04:12:15.659806Z [2mdist/[22m[2massets/[22m[36mEventsByLocation-CKNUYysb.js [39m[1m[2m 8.87 kB[22m[1m[22m[2m │ gzip: 2.99 kB[22m[2m │ map: 20.21 kB[22m
2025-10-01T04:12:15.659945Z [2mdist/[22m[2massets/[22m[36mGuidesPage-BOkrMT28.js [39m[1m[2m 9.02 kB[22m[1m[22m[2m │ gzip: 2.86 kB[22m[2m │ map: 16.75 kB[22m
2025-10-01T04:12:15.660074Z [2mdist/[22m[2massets/[22m[36mEventsThisWeekend-Dl12IMh2.js [39m[1m[2m 9.07 kB[22m[1m[22m[2m │ gzip: 2.90 kB[22m[2m │ map: 23.21 kB[22m
2025-10-01T04:12:15.660181Z [2mdist/[22m[2massets/[22m[36mAdminArticleEditor-CtIoIDTm.js [39m[1m[2m 9.51 kB[22m[1m[22m[2m │ gzip: 3.04 kB[22m[2m │ map: 28.03 kB[22m
2025-10-01T04:12:15.660306Z [2mdist/[22m[2massets/[22m[36mArticles-BoSZr46y.js [39m[1m[2m 9.65 kB[22m[1m[22m[2m │ gzip: 3.11 kB[22m[2m │ map: 25.08 kB[22m
2025-10-01T04:12:15.660393Z [2mdist/[22m[2massets/[22m[36mPlaygrounds-Bu7Tbxjl.js [39m[1m[2m 10.42 kB[22m[1m[22m[2m │ gzip: 3.53 kB[22m[2m │ map: 29.03 kB[22m
2025-10-01T04:12:15.660479Z [2mdist/[22m[2massets/[22m[36mRestaurantsPage-C22cFCFU.js [39m[1m[2m 10.52 kB[22m[1m[22m[2m │ gzip: 3.47 kB[22m[2m │ map: 28.69 kB[22m
2025-10-01T04:12:15.660589Z [2mdist/[22m[2massets/[22m[36mSmartCalendarIntegration-DOYQO9Pq.js [39m[1m[2m 11.06 kB[22m[1m[22m[2m │ gzip: 3.16 kB[22m[2m │ map: 34.84 kB[22m
2025-10-01T04:12:15.660699Z [2mdist/[22m[2massets/[22m[36mProfile-yxsZ2DMK.js [39m[1m[2m 11.52 kB[22m[1m[22m[2m │ gzip: 3.27 kB[22m[2m │ map: 28.56 kB[22m
2025-10-01T04:12:15.660817Z [2mdist/[22m[2massets/[22m[36mRestaurantDetails-C4ZLVgWy.js [39m[1m[2m 14.38 kB[22m[1m[22m[2m │ gzip: 3.92 kB[22m[2m │ map: 38.88 kB[22m
2025-10-01T04:12:15.660957Z [2mdist/[22m[2massets/[22m[36museEventSocial-Wm72l2Wl.js [39m[1m[2m 14.54 kB[22m[1m[22m[2m │ gzip: 4.30 kB[22m[2m │ map: 42.49 kB[22m
2025-10-01T04:12:15.661055Z [2mdist/[22m[2massets/[22m[36mUserDashboard-BXWPl9wD.js [39m[1m[2m 15.27 kB[22m[1m[22m[2m │ gzip: 4.38 kB[22m[2m │ map: 39.51 kB[22m
2025-10-01T04:12:15.66116Z [2mdist/[22m[2massets/[22m[36mGamification-D7P4hM0u.js [39m[1m[2m 18.15 kB[22m[1m[22m[2m │ gzip: 4.82 kB[22m[2m │ map: 50.69 kB[22m
2025-10-01T04:12:15.661295Z [2mdist/[22m[2massets/[22m[36mAdvertise-DWBO_Ggc.js [39m[1m[2m 18.30 kB[22m[1m[22m[2m │ gzip: 4.81 kB[22m[2m │ map: 42.21 kB[22m
2025-10-01T04:12:15.66139Z [2mdist/[22m[2massets/[22m[36mEventsPage-djr1RbAl.js [39m[1m[2m 18.46 kB[22m[1m[22m[2m │ gzip: 5.78 kB[22m[2m │ map: 52.48 kB[22m
2025-10-01T04:12:15.661498Z [2mdist/[22m[2massets/[22m[36mIowaStateFairPage-CLGNM8M0.js [39m[1m[2m 18.61 kB[22m[1m[22m[2m │ gzip: 5.05 kB[22m[2m │ map: 35.39 kB[22m
2025-10-01T04:12:15.661608Z [2mdist/[22m[2massets/[22m[36mNeighborhoodPage-DdnL8ftS.js [39m[1m[2m 19.02 kB[22m[1m[22m[2m │ gzip: 5.35 kB[22m[2m │ map: 35.14 kB[22m
2025-10-01T04:12:15.661715Z [2mdist/[22m[2massets/[22m[36mSocial-qJTfryXF.js [39m[1m[2m 22.03 kB[22m[1m[22m[2m │ gzip: 5.10 kB[22m[2m │ map: 64.79 kB[22m
2025-10-01T04:12:15.661814Z [2mdist/[22m[2massets/[22m[36mindex-DvtDXccV.js [39m[1m[2m 22.62 kB[22m[1m[22m[2m │ gzip: 7.05 kB[22m[2m │ map: 47.51 kB[22m
2025-10-01T04:12:15.661938Z [2mdist/[22m[2massets/[22m[36mAdvancedSearchPage-CnHSOv-F.js [39m[1m[2m 24.01 kB[22m[1m[22m[2m │ gzip: 6.36 kB[22m[2m │ map: 77.43 kB[22m
2025-10-01T04:12:15.662057Z [2mdist/[22m[2massets/[22m[36mFooter-Bxr8WUVN.js [39m[1m[2m 25.30 kB[22m[1m[22m[2m │ gzip: 6.90 kB[22m[2m │ map: 68.29 kB[22m
2025-10-01T04:12:15.662166Z [2mdist/[22m[2massets/[22m[36mRestaurants-DNwgtMPV.js [39m[1m[2m 26.38 kB[22m[1m[22m[2m │ gzip: 7.24 kB[22m[2m │ map: 63.75 kB[22m
2025-10-01T04:12:15.662274Z [2mdist/[22m[2massets/[22m[36mBusinessPartnership-B0mYi05z.js [39m[1m[2m 26.66 kB[22m[1m[22m[2m │ gzip: 5.98 kB[22m[2m │ map: 71.57 kB[22m
2025-10-01T04:12:15.662462Z [2mdist/[22m[2massets/[22m[36mRealTimePage-FC6oC0aD.js [39m[1m[2m 29.16 kB[22m[1m[22m[2m │ gzip: 7.34 kB[22m[2m │ map: 67.10 kB[22m
2025-10-01T04:12:15.662566Z [2mdist/[22m[2massets/[22m[36mEventDetails-CLjwCNlT.js [39m[1m[2m 29.30 kB[22m[1m[22m[2m │ gzip: 7.85 kB[22m[2m │ map: 85.87 kB[22m
2025-10-01T04:12:15.662663Z [2mdist/[22m[2massets/[22m[36mvendor-query-BVjCvOi4.js [39m[1m[2m 34.48 kB[22m[1m[22m[2m │ gzip: 9.87 kB[22m[2m │ map: 126.36 kB[22m
2025-10-01T04:12:15.662762Z [2mdist/[22m[2massets/[22m[36mvendor-date-CZLXoD8C.js [39m[1m[2m 35.26 kB[22m[1m[22m[2m │ gzip: 10.28 kB[22m[2m │ map: 282.47 kB[22m
2025-10-01T04:12:15.662889Z [2mdist/[22m[2massets/[22m[36mIndex-DjoKO2Z2.js [39m[1m[2m 94.58 kB[22m[1m[22m[2m │ gzip: 23.96 kB[22m[2m │ map: 292.87 kB[22m
2025-10-01T04:12:15.662995Z [2mdist/[22m[2massets/[22m[36mvendor-supabase-CHM5h-i2.js [39m[1m[2m 114.22 kB[22m[1m[22m[2m │ gzip: 30.12 kB[22m[2m │ map: 495.43 kB[22m
2025-10-01T04:12:15.663098Z [2mdist/[22m[2massets/[22m[36mAdmin-BB1useVz.js [39m[1m[2m 315.65 kB[22m[1m[22m[2m │ gzip: 65.06 kB[22m[2m │ map: 942.46 kB[22m
2025-10-01T04:12:15.663213Z [2mdist/[22m[2massets/[22m[36mvendor-react-BJUTLwRx.js [39m[1m[33m1,010.25 kB[39m[22m[2m │ gzip: 289.03 kB[22m[2m │ map: 3,447.24 kB[22m
2025-10-01T04:12:15.663407Z [2mdist/[22m[2massets/[22m[36mvendor-other-BlNzYQKF.js [39m[1m[33m1,273.24 kB[39m[22m[2m │ gzip: 334.43 kB[22m[2m │ map: 5,121.47 kB[22m
2025-10-01T04:12:15.66351Z [32m✓ built in 37.60s[39m
2025-10-01T04:12:15.663606Z [33m
2025-10-01T04:12:15.663681Z (!) Some chunks are larger than 600 kB after minification. Consider:
2025-10-01T04:12:15.663764Z - Using dynamic import() to code-split the application
2025-10-01T04:12:15.663912Z - Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
2025-10-01T04:12:15.664098Z - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
2025-10-01T04:12:15.954894Z Finished
2025-10-01T04:12:16.85671Z Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T04:12:16.857361Z
2025-10-01T04:12:17.971265Z No wrangler.toml file found. Continuing.
2025-10-01T04:12:17.97213Z Note: No functions dir at /functions found. Skipping.
2025-10-01T04:12:17.972328Z Validating asset output directory
2025-10-01T04:12:20.857128Z Deploying your site to Cloudflare's global network...
2025-10-01T04:12:22.047069Z Parsed 20 valid header rules.
2025-10-01T04:12:23.431222Z Uploading... (201/201)
2025-10-01T04:12:23.432081Z ✨ Success! Uploaded 0 files (201 already uploaded) (0.39 sec)
2025-10-01T04:12:23.432207Z
2025-10-01T04:12:23.941777Z ✨ Upload complete!
2025-10-01T04:12:27.467554Z Skipping build output cache as it's not supported for your project
2025-10-01T04:12:28.65452Z Success: Assets published!
2025-10-01T04:12:31.351565Z Success: Your site was deployed!
