2025-10-01T03:52:44.918763Z Cloning repository...
2025-10-01T03:52:46.120851Z From https://github.com/dj-pearson/desmoines-ai-pulse
2025-10-01T03:52:46.121311Z * branch 2d8b8a84f66933f71c37c30624785b7619a6cf6c -> FETCH_HEAD
2025-10-01T03:52:46.121412Z
2025-10-01T03:52:46.219184Z HEAD is now at 2d8b8a8 Update service worker caching strategy and fix lazy-loaded component routing
2025-10-01T03:52:46.219723Z
2025-10-01T03:52:46.294443Z
2025-10-01T03:52:46.294907Z Using v2 root directory strategy
2025-10-01T03:52:46.317157Z Success: Finished cloning repository files
2025-10-01T03:52:47.334714Z Restoring from dependencies cache
2025-10-01T03:52:47.350944Z Restoring from build output cache
2025-10-01T03:52:48.506507Z Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T03:52:48.507103Z
2025-10-01T03:52:49.611137Z No wrangler.toml file found. Continuing.
2025-10-01T03:52:49.688736Z Detected the following tools from environment: nodejs@20.18.0, npm@10.9.2
2025-10-01T03:52:49.689334Z Installing nodejs 20.18.0
2025-10-01T03:52:50.695247Z Trying to update node-build... ok
2025-10-01T03:52:50.790698Z To follow progress, use 'tail -f /tmp/node-build.20251001035250.496.log' or pass --verbose
2025-10-01T03:52:50.88608Z Downloading node-v20.18.0-linux-x64.tar.gz...
2025-10-01T03:52:51.10793Z -> https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz
2025-10-01T03:52:52.963161Z
2025-10-01T03:52:52.963433Z WARNING: node-v20.18.0-linux-x64 is in LTS Maintenance mode and nearing its end of life.
2025-10-01T03:52:52.963553Z It only receives *critical* security updates, *critical* bug fixes and documentation updates.
2025-10-01T03:52:52.963641Z
2025-10-01T03:52:52.96373Z Installing node-v20.18.0-linux-x64...
2025-10-01T03:52:53.356843Z Installed node-v20.18.0-linux-x64 to /opt/buildhome/.asdf/installs/nodejs/20.18.0
2025-10-01T03:52:53.357063Z
2025-10-01T03:52:54.363676Z Installing project dependencies: npm clean-install --progress=false
2025-10-01T03:53:00.108934Z npm warn deprecated @types/dompurify@3.2.0: This is a stub types definition. dompurify provides its own type definitions, so you do not need this installed.
2025-10-01T03:53:00.575571Z npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
2025-10-01T03:53:04.11477Z npm warn deprecated three-mesh-bvh@0.7.8: Deprecated due to three.js version incompatibility. Please use v0.8.0, instead.
2025-10-01T03:53:20.535377Z
2025-10-01T03:53:20.544751Z added 695 packages, and audited 696 packages in 26s
2025-10-01T03:53:20.544991Z
2025-10-01T03:53:20.545197Z 103 packages are looking for funding
2025-10-01T03:53:20.545812Z run `npm fund` for details
2025-10-01T03:53:20.55494Z
2025-10-01T03:53:20.556376Z 6 vulnerabilities (3 low, 3 moderate)
2025-10-01T03:53:20.556855Z
2025-10-01T03:53:20.557022Z To address all issues, run:
2025-10-01T03:53:20.557126Z npm audit fix
2025-10-01T03:53:20.557206Z
2025-10-01T03:53:20.557288Z Run `npm audit` for details.
2025-10-01T03:53:20.576461Z Executing user command: npm run build
2025-10-01T03:53:20.983036Z
2025-10-01T03:53:20.983311Z > vite_react_shadcn_ts@0.0.0 build
2025-10-01T03:53:20.983514Z > vite build
2025-10-01T03:53:20.98365Z
2025-10-01T03:53:21.261352Z [36mvite v5.4.10 [32mbuilding for production...[36m[39m
2025-10-01T03:53:21.599931Z transforming...
2025-10-01T03:53:38.040836Z [32m✓[39m 4260 modules transformed.
2025-10-01T03:53:39.68255Z rendering chunks...
2025-10-01T03:53:57.547082Z computing gzip size...
2025-10-01T03:53:57.649098Z [2mdist/[22m[2massets/[22m[32mApp-BsTyPTsK.tsx [39m[1m[2m 6.76 kB[22m[1m[22m
2025-10-01T03:53:57.649332Z [2mdist/[22m[32mindex.html [39m[1m[2m 15.75 kB[22m[1m[22m[2m │ gzip: 5.24 kB[22m
2025-10-01T03:53:57.649507Z [2mdist/[22m[2massets/[22m[35mvendor-other-Dgihpmma.css [39m[1m[2m 15.04 kB[22m[1m[22m[2m │ gzip: 6.38 kB[22m
2025-10-01T03:53:57.650236Z [2mdist/[22m[2massets/[22m[35mindex-IE542Gmw.css [39m[1m[2m 125.20 kB[22m[1m[22m[2m │ gzip: 19.50 kB[22m
2025-10-01T03:53:57.650469Z [2mdist/[22m[2massets/[22m[36mvendor-ui-ByoYm48K.js [39m[1m[2m 0.25 kB[22m[1m[22m[2m │ gzip: 0.21 kB[22m[2m │ map: 1.25 kB[22m
2025-10-01T03:53:57.650687Z [2mdist/[22m[2massets/[22m[36mskeleton-mGuZGEtJ.js [39m[1m[2m 0.26 kB[22m[1m[22m[2m │ gzip: 0.22 kB[22m[2m │ map: 0.55 kB[22m
2025-10-01T03:53:57.650929Z [2mdist/[22m[2massets/[22m[36mseparator-Dae1tIj8.js [39m[1m[2m 0.42 kB[22m[1m[22m[2m │ gzip: 0.31 kB[22m[2m │ map: 1.29 kB[22m
2025-10-01T03:53:57.651102Z [2mdist/[22m[2massets/[22m[36mlabel-DbpYWBHN.js [39m[1m[2m 0.42 kB[22m[1m[22m[2m │ gzip: 0.30 kB[22m[2m │ map: 1.17 kB[22m
2025-10-01T03:53:57.651244Z [2mdist/[22m[2massets/[22m[36mclient-CuNO40hr.js [39m[1m[2m 0.44 kB[22m[1m[22m[2m │ gzip: 0.38 kB[22m[2m │ map: 1.14 kB[22m
2025-10-01T03:53:57.651411Z [2mdist/[22m[2massets/[22m[36mprogress-DZNUXRMr.js [39m[1m[2m 0.48 kB[22m[1m[22m[2m │ gzip: 0.36 kB[22m[2m │ map: 1.38 kB[22m
2025-10-01T03:53:57.651549Z [2mdist/[22m[2massets/[22m[36mtextarea-BziXp-7B.js [39m[1m[2m 0.57 kB[22m[1m[22m[2m │ gzip: 0.38 kB[22m[2m │ map: 1.13 kB[22m
2025-10-01T03:53:57.65167Z [2mdist/[22m[2massets/[22m[36minput-e-4gUWzU.js [39m[1m[2m 0.66 kB[22m[1m[22m[2m │ gzip: 0.41 kB[22m[2m │ map: 1.16 kB[22m
2025-10-01T03:53:57.651829Z [2mdist/[22m[2massets/[22m[36mcheckbox-Bq650Bpd.js [39m[1m[2m 0.72 kB[22m[1m[22m[2m │ gzip: 0.43 kB[22m[2m │ map: 1.63 kB[22m
2025-10-01T03:53:57.652004Z [2mdist/[22m[2massets/[22m[36mslider-B3N1sq2i.js [39m[1m[2m 0.80 kB[22m[1m[22m[2m │ gzip: 0.47 kB[22m[2m │ map: 1.71 kB[22m
2025-10-01T03:53:57.652151Z [2mdist/[22m[2massets/[22m[36mpopover-BBPRIcpx.js [39m[1m[2m 0.82 kB[22m[1m[22m[2m │ gzip: 0.45 kB[22m[2m │ map: 1.83 kB[22m
2025-10-01T03:53:57.65228Z [2mdist/[22m[2massets/[22m[36mbadge-DZ0-1i3v.js [39m[1m[2m 0.83 kB[22m[1m[22m[2m │ gzip: 0.45 kB[22m[2m │ map: 1.70 kB[22m
2025-10-01T03:53:57.652414Z [2mdist/[22m[2massets/[22m[36mswitch-Ds0ODq3k.js [39m[1m[2m 0.86 kB[22m[1m[22m[2m │ gzip: 0.48 kB[22m[2m │ map: 1.63 kB[22m
2025-10-01T03:53:57.652541Z [2mdist/[22m[2massets/[22m[36malert-2sReonCP.js [39m[1m[2m 1.02 kB[22m[1m[22m[2m │ gzip: 0.54 kB[22m[2m │ map: 2.47 kB[22m
2025-10-01T03:53:57.652662Z [2mdist/[22m[2massets/[22m[36merrorSuppression-LVnJe3hs.js [39m[1m[2m 1.08 kB[22m[1m[22m[2m │ gzip: 0.55 kB[22m[2m │ map: 4.33 kB[22m
2025-10-01T03:53:57.652784Z [2mdist/[22m[2massets/[22m[36museProfile-ar63XZr0.js [39m[1m[2m 1.09 kB[22m[1m[22m[2m │ gzip: 0.58 kB[22m[2m │ map: 4.51 kB[22m
2025-10-01T03:53:57.652946Z [2mdist/[22m[2massets/[22m[36mtabs-Do7v7h8b.js [39m[1m[2m 1.16 kB[22m[1m[22m[2m │ gzip: 0.51 kB[22m[2m │ map: 2.70 kB[22m
2025-10-01T03:53:57.653075Z [2mdist/[22m[2massets/[22m[36mAIWriteup-Cz2Aju73.js [39m[1m[2m 1.35 kB[22m[1m[22m[2m │ gzip: 0.72 kB[22m[2m │ map: 3.15 kB[22m
2025-10-01T03:53:57.653211Z [2mdist/[22m[2massets/[22m[36musePlaygrounds-CcQa7Amw.js [39m[1m[2m 1.39 kB[22m[1m[22m[2m │ gzip: 0.65 kB[22m[2m │ map: 5.68 kB[22m
2025-10-01T03:53:57.653319Z [2mdist/[22m[2massets/[22m[36museSocialFeatures-C6u7xR9M.js [39m[1m[2m 1.48 kB[22m[1m[22m[2m │ gzip: 0.66 kB[22m[2m │ map: 9.52 kB[22m
2025-10-01T03:53:57.653419Z [2mdist/[22m[2massets/[22m[36museAuth-QYBUzbbh.js [39m[1m[2m 1.49 kB[22m[1m[22m[2m │ gzip: 0.73 kB[22m[2m │ map: 6.23 kB[22m
2025-10-01T03:53:57.653527Z [2mdist/[22m[2massets/[22m[36museAttractions-D1JZsT8f.js [39m[1m[2m 1.50 kB[22m[1m[22m[2m │ gzip: 0.70 kB[22m[2m │ map: 6.15 kB[22m
2025-10-01T03:53:57.653658Z [2mdist/[22m[2massets/[22m[36mFAQSection-C13Mv9Kx.js [39m[1m[2m 1.51 kB[22m[1m[22m[2m │ gzip: 0.77 kB[22m[2m │ map: 4.75 kB[22m
2025-10-01T03:53:57.653773Z [2mdist/[22m[2massets/[22m[36mtimezone-BBSHPwJT.js [39m[1m[2m 1.59 kB[22m[1m[22m[2m │ gzip: 0.63 kB[22m[2m │ map: 7.93 kB[22m
2025-10-01T03:53:57.653963Z [2mdist/[22m[2massets/[22m[36museUserSubmittedEvents-BsAcSf-1.js [39m[1m[2m 1.61 kB[22m[1m[22m[2m │ gzip: 0.65 kB[22m[2m │ map: 6.58 kB[22m
2025-10-01T03:53:57.654091Z [2mdist/[22m[2massets/[22m[36museEvents-CIimIxwo.js [39m[1m[2m 1.68 kB[22m[1m[22m[2m │ gzip: 0.79 kB[22m[2m │ map: 7.28 kB[22m
2025-10-01T03:53:57.654193Z [2mdist/[22m[2massets/[22m[36museSupabase-\_N6Yn2UJ.js [39m[1m[2m 1.78 kB[22m[1m[22m[2m │ gzip: 0.80 kB[22m[2m │ map: 9.68 kB[22m
2025-10-01T03:53:57.654291Z [2mdist/[22m[2massets/[22m[36mcalendar-BlzaO1V7.js [39m[1m[2m 1.91 kB[22m[1m[22m[2m │ gzip: 0.85 kB[22m[2m │ map: 3.97 kB[22m
2025-10-01T03:53:57.654393Z [2mdist/[22m[2massets/[22m[36mperformance-DRNioTBP.js [39m[1m[2m 1.97 kB[22m[1m[22m[2m │ gzip: 0.89 kB[22m[2m │ map: 9.57 kB[22m
2025-10-01T03:53:57.654487Z [2mdist/[22m[2massets/[22m[36mNotFound-fcgUXwQw.js [39m[1m[2m 2.00 kB[22m[1m[22m[2m │ gzip: 0.92 kB[22m[2m │ map: 4.16 kB[22m
2025-10-01T03:53:57.654582Z [2mdist/[22m[2massets/[22m[36malert-dialog-CVSL9VBV.js [39m[1m[2m 2.08 kB[22m[1m[22m[2m │ gzip: 0.78 kB[22m[2m │ map: 6.41 kB[22m
2025-10-01T03:53:57.654686Z [2mdist/[22m[2massets/[22m[36mloading-skeleton-Dz2JPz5U.js [39m[1m[2m 2.16 kB[22m[1m[22m[2m │ gzip: 0.80 kB[22m[2m │ map: 8.21 kB[22m
2025-10-01T03:53:57.654912Z [2mdist/[22m[2massets/[22m[36mdialog-BQ_a3x37.js [39m[1m[2m 2.23 kB[22m[1m[22m[2m │ gzip: 0.89 kB[22m[2m │ map: 5.48 kB[22m
2025-10-01T03:53:57.655025Z [2mdist/[22m[2massets/[22m[36museCampaigns-CcpIkXym.js [39m[1m[2m 2.31 kB[22m[1m[22m[2m │ gzip: 0.91 kB[22m[2m │ map: 8.66 kB[22m
2025-10-01T03:53:57.655128Z [2mdist/[22m[2massets/[22m[36mselect-De5Ji6QN.js [39m[1m[2m 3.00 kB[22m[1m[22m[2m │ gzip: 1.11 kB[22m[2m │ map: 8.01 kB[22m
2025-10-01T03:53:57.655221Z [2mdist/[22m[2massets/[22m[36museRestaurants-B9D5ItOR.js [39m[1m[2m 3.05 kB[22m[1m[22m[2m │ gzip: 1.12 kB[22m[2m │ map: 12.18 kB[22m
2025-10-01T03:53:57.655323Z [2mdist/[22m[2massets/[22m[36museArticles-JSsQoSYB.js [39m[1m[2m 3.21 kB[22m[1m[22m[2m │ gzip: 1.11 kB[22m[2m │ map: 11.38 kB[22m
2025-10-01T03:53:57.655421Z [2mdist/[22m[2massets/[22m[36mEventPhotoUpload-BhTcVBf0.js [39m[1m[2m 3.48 kB[22m[1m[22m[2m │ gzip: 1.58 kB[22m[2m │ map: 11.37 kB[22m
2025-10-01T03:53:57.655527Z [2mdist/[22m[2massets/[22m[36mCampaignDashboard-p_oPsR8C.js [39m[1m[2m 3.89 kB[22m[1m[22m[2m │ gzip: 1.29 kB[22m[2m │ map: 8.94 kB[22m
2025-10-01T03:53:57.655621Z [2mdist/[22m[2massets/[22m[36museCommunityFeatures-BhqV23bJ.js [39m[1m[2m 4.55 kB[22m[1m[22m[2m │ gzip: 1.50 kB[22m[2m │ map: 17.48 kB[22m
2025-10-01T03:53:57.655735Z [2mdist/[22m[2massets/[22m[36mSEOHead-BXairrZU.js [39m[1m[2m 4.58 kB[22m[1m[22m[2m │ gzip: 1.52 kB[22m[2m │ map: 12.43 kB[22m
2025-10-01T03:53:57.655834Z [2mdist/[22m[2massets/[22m[36mLocalSEO-CToWAuBV.js [39m[1m[2m 5.02 kB[22m[1m[22m[2m │ gzip: 1.62 kB[22m[2m │ map: 12.41 kB[22m
2025-10-01T03:53:57.655949Z [2mdist/[22m[2massets/[22m[36mShareDialog-ByVb1X5c.js [39m[1m[2m 5.18 kB[22m[1m[22m[2m │ gzip: 2.51 kB[22m[2m │ map: 11.47 kB[22m
2025-10-01T03:53:57.656054Z [2mdist/[22m[2massets/[22m[36mEnhancedLocalSEO-dugKrai4.js [39m[1m[2m 5.37 kB[22m[1m[22m[2m │ gzip: 1.69 kB[22m[2m │ map: 16.66 kB[22m
2025-10-01T03:53:57.656154Z [2mdist/[22m[2massets/[22m[36mWeekendPage-C3wYCQre.js [39m[1m[2m 5.56 kB[22m[1m[22m[2m │ gzip: 2.16 kB[22m[2m │ map: 14.76 kB[22m
2025-10-01T03:53:57.656259Z [2mdist/[22m[2massets/[22m[36mAttractionDetails-fsl6KQK9.js [39m[1m[2m 6.13 kB[22m[1m[22m[2m │ gzip: 2.23 kB[22m[2m │ map: 16.30 kB[22m
2025-10-01T03:53:57.656351Z [2mdist/[22m[2massets/[22m[36mPlaygroundDetails-BwD0jHKz.js [39m[1m[2m 6.51 kB[22m[1m[22m[2m │ gzip: 2.17 kB[22m[2m │ map: 17.43 kB[22m
2025-10-01T03:53:57.656441Z [2mdist/[22m[2massets/[22m[36mEventsToday-M9NVRjii.js [39m[1m[2m 6.72 kB[22m[1m[22m[2m │ gzip: 2.30 kB[22m[2m │ map: 13.94 kB[22m
2025-10-01T03:53:57.656532Z [2mdist/[22m[2massets/[22m[36mEventCard-n4ZkLL7w.js [39m[1m[2m 7.14 kB[22m[1m[22m[2m │ gzip: 2.39 kB[22m[2m │ map: 23.52 kB[22m
2025-10-01T03:53:57.656625Z [2mdist/[22m[2massets/[22m[36mArticleDetails-CqkDoRzf.js [39m[1m[2m 7.48 kB[22m[1m[22m[2m │ gzip: 2.32 kB[22m[2m │ map: 18.28 kB[22m
2025-10-01T03:53:57.656813Z [2mdist/[22m[2massets/[22m[36mAuth-BlOkecQ0.js [39m[1m[2m 7.71 kB[22m[1m[22m[2m │ gzip: 2.46 kB[22m[2m │ map: 21.63 kB[22m
2025-10-01T03:53:57.657091Z [2mdist/[22m[2massets/[22m[36mNeighborhoodsPage-BhHTWR_d.js [39m[1m[2m 7.82 kB[22m[1m[22m[2m │ gzip: 2.54 kB[22m[2m │ map: 14.84 kB[22m
2025-10-01T03:53:57.65721Z [2mdist/[22m[2massets/[22m[36mAttractions-ByD639hx.js [39m[1m[2m 8.35 kB[22m[1m[22m[2m │ gzip: 2.85 kB[22m[2m │ map: 22.36 kB[22m
2025-10-01T03:53:57.657305Z [2mdist/[22m[2massets/[22m[36mMonthlyEventsPage-CEJdTEZv.js [39m[1m[2m 8.39 kB[22m[1m[22m[2m │ gzip: 2.84 kB[22m[2m │ map: 20.27 kB[22m
2025-10-01T03:53:57.657406Z [2mdist/[22m[2massets/[22m[36mEventsByLocation-CKNUYysb.js [39m[1m[2m 8.87 kB[22m[1m[22m[2m │ gzip: 2.99 kB[22m[2m │ map: 20.21 kB[22m
2025-10-01T03:53:57.657499Z [2mdist/[22m[2massets/[22m[36mGuidesPage-BOkrMT28.js [39m[1m[2m 9.02 kB[22m[1m[22m[2m │ gzip: 2.86 kB[22m[2m │ map: 16.75 kB[22m
2025-10-01T03:53:57.657599Z [2mdist/[22m[2massets/[22m[36mEventsThisWeekend-Dl12IMh2.js [39m[1m[2m 9.07 kB[22m[1m[22m[2m │ gzip: 2.90 kB[22m[2m │ map: 23.21 kB[22m
2025-10-01T03:53:57.657691Z [2mdist/[22m[2massets/[22m[36mAdminArticleEditor-CtIoIDTm.js [39m[1m[2m 9.51 kB[22m[1m[22m[2m │ gzip: 3.04 kB[22m[2m │ map: 28.03 kB[22m
2025-10-01T03:53:57.657798Z [2mdist/[22m[2massets/[22m[36mArticles-BoSZr46y.js [39m[1m[2m 9.65 kB[22m[1m[22m[2m │ gzip: 3.11 kB[22m[2m │ map: 25.08 kB[22m
2025-10-01T03:53:57.658216Z [2mdist/[22m[2massets/[22m[36mPlaygrounds-Bu7Tbxjl.js [39m[1m[2m 10.42 kB[22m[1m[22m[2m │ gzip: 3.53 kB[22m[2m │ map: 29.03 kB[22m
2025-10-01T03:53:57.658347Z [2mdist/[22m[2massets/[22m[36mRestaurantsPage-C22cFCFU.js [39m[1m[2m 10.52 kB[22m[1m[22m[2m │ gzip: 3.47 kB[22m[2m │ map: 28.69 kB[22m
2025-10-01T03:53:57.658451Z [2mdist/[22m[2massets/[22m[36mSmartCalendarIntegration-DOYQO9Pq.js [39m[1m[2m 11.06 kB[22m[1m[22m[2m │ gzip: 3.16 kB[22m[2m │ map: 34.84 kB[22m
2025-10-01T03:53:57.658557Z [2mdist/[22m[2massets/[22m[36mProfile-yxsZ2DMK.js [39m[1m[2m 11.52 kB[22m[1m[22m[2m │ gzip: 3.27 kB[22m[2m │ map: 28.56 kB[22m
2025-10-01T03:53:57.658674Z [2mdist/[22m[2massets/[22m[36mRestaurantDetails-C4ZLVgWy.js [39m[1m[2m 14.38 kB[22m[1m[22m[2m │ gzip: 3.92 kB[22m[2m │ map: 38.88 kB[22m
2025-10-01T03:53:57.658776Z [2mdist/[22m[2massets/[22m[36museEventSocial-Wm72l2Wl.js [39m[1m[2m 14.54 kB[22m[1m[22m[2m │ gzip: 4.30 kB[22m[2m │ map: 42.49 kB[22m
2025-10-01T03:53:57.658863Z [2mdist/[22m[2massets/[22m[36mUserDashboard-BXWPl9wD.js [39m[1m[2m 15.27 kB[22m[1m[22m[2m │ gzip: 4.38 kB[22m[2m │ map: 39.51 kB[22m
2025-10-01T03:53:57.658979Z [2mdist/[22m[2massets/[22m[36mGamification-D7P4hM0u.js [39m[1m[2m 18.15 kB[22m[1m[22m[2m │ gzip: 4.82 kB[22m[2m │ map: 50.69 kB[22m
2025-10-01T03:53:57.65908Z [2mdist/[22m[2massets/[22m[36mAdvertise-DWBO_Ggc.js [39m[1m[2m 18.30 kB[22m[1m[22m[2m │ gzip: 4.81 kB[22m[2m │ map: 42.21 kB[22m
2025-10-01T03:53:57.659176Z [2mdist/[22m[2massets/[22m[36mEventsPage-djr1RbAl.js [39m[1m[2m 18.46 kB[22m[1m[22m[2m │ gzip: 5.78 kB[22m[2m │ map: 52.48 kB[22m
2025-10-01T03:53:57.659282Z [2mdist/[22m[2massets/[22m[36mIowaStateFairPage-CLGNM8M0.js [39m[1m[2m 18.61 kB[22m[1m[22m[2m │ gzip: 5.05 kB[22m[2m │ map: 35.39 kB[22m
2025-10-01T03:53:57.659383Z [2mdist/[22m[2massets/[22m[36mNeighborhoodPage-DdnL8ftS.js [39m[1m[2m 19.02 kB[22m[1m[22m[2m │ gzip: 5.35 kB[22m[2m │ map: 35.14 kB[22m
2025-10-01T03:53:57.659481Z [2mdist/[22m[2massets/[22m[36mSocial-qJTfryXF.js [39m[1m[2m 22.03 kB[22m[1m[22m[2m │ gzip: 5.10 kB[22m[2m │ map: 64.79 kB[22m
2025-10-01T03:53:57.659575Z [2mdist/[22m[2massets/[22m[36mindex-DvtDXccV.js [39m[1m[2m 22.62 kB[22m[1m[22m[2m │ gzip: 7.05 kB[22m[2m │ map: 47.51 kB[22m
2025-10-01T03:53:57.659673Z [2mdist/[22m[2massets/[22m[36mAdvancedSearchPage-CnHSOv-F.js [39m[1m[2m 24.01 kB[22m[1m[22m[2m │ gzip: 6.36 kB[22m[2m │ map: 77.43 kB[22m
2025-10-01T03:53:57.659779Z [2mdist/[22m[2massets/[22m[36mFooter-Bxr8WUVN.js [39m[1m[2m 25.30 kB[22m[1m[22m[2m │ gzip: 6.90 kB[22m[2m │ map: 68.29 kB[22m
2025-10-01T03:53:57.659869Z [2mdist/[22m[2massets/[22m[36mRestaurants-DNwgtMPV.js [39m[1m[2m 26.38 kB[22m[1m[22m[2m │ gzip: 7.24 kB[22m[2m │ map: 63.75 kB[22m
2025-10-01T03:53:57.659987Z [2mdist/[22m[2massets/[22m[36mBusinessPartnership-B0mYi05z.js [39m[1m[2m 26.66 kB[22m[1m[22m[2m │ gzip: 5.98 kB[22m[2m │ map: 71.57 kB[22m
2025-10-01T03:53:57.660106Z [2mdist/[22m[2massets/[22m[36mRealTimePage-FC6oC0aD.js [39m[1m[2m 29.16 kB[22m[1m[22m[2m │ gzip: 7.34 kB[22m[2m │ map: 67.10 kB[22m
2025-10-01T03:53:57.660205Z [2mdist/[22m[2massets/[22m[36mEventDetails-CLjwCNlT.js [39m[1m[2m 29.30 kB[22m[1m[22m[2m │ gzip: 7.85 kB[22m[2m │ map: 85.87 kB[22m
2025-10-01T03:53:57.660302Z [2mdist/[22m[2massets/[22m[36mvendor-query-BVjCvOi4.js [39m[1m[2m 34.48 kB[22m[1m[22m[2m │ gzip: 9.87 kB[22m[2m │ map: 126.36 kB[22m
2025-10-01T03:53:57.660396Z [2mdist/[22m[2massets/[22m[36mvendor-date-CZLXoD8C.js [39m[1m[2m 35.26 kB[22m[1m[22m[2m │ gzip: 10.28 kB[22m[2m │ map: 282.47 kB[22m
2025-10-01T03:53:57.660492Z [2mdist/[22m[2massets/[22m[36mIndex-DjoKO2Z2.js [39m[1m[2m 94.58 kB[22m[1m[22m[2m │ gzip: 23.96 kB[22m[2m │ map: 292.87 kB[22m
2025-10-01T03:53:57.660589Z [2mdist/[22m[2massets/[22m[36mvendor-supabase-CHM5h-i2.js [39m[1m[2m 114.22 kB[22m[1m[22m[2m │ gzip: 30.12 kB[22m[2m │ map: 495.43 kB[22m
2025-10-01T03:53:57.660683Z [2mdist/[22m[2massets/[22m[36mAdmin-BB1useVz.js [39m[1m[2m 315.65 kB[22m[1m[22m[2m │ gzip: 65.06 kB[22m[2m │ map: 942.46 kB[22m
2025-10-01T03:53:57.660791Z [2mdist/[22m[2massets/[22m[36mvendor-react-BJUTLwRx.js [39m[1m[33m1,010.25 kB[39m[22m[2m │ gzip: 289.03 kB[22m[2m │ map: 3,447.24 kB[22m
2025-10-01T03:53:57.660897Z [2mdist/[22m[2massets/[22m[36mvendor-other-BlNzYQKF.js [39m[1m[33m1,273.24 kB[39m[22m[2m │ gzip: 334.43 kB[22m[2m │ map: 5,121.47 kB[22m
2025-10-01T03:53:57.661006Z [32m✓ built in 36.36s[39m
2025-10-01T03:53:57.661105Z [33m
2025-10-01T03:53:57.661205Z (!) Some chunks are larger than 600 kB after minification. Consider:
2025-10-01T03:53:57.661304Z - Using dynamic import() to code-split the application
2025-10-01T03:53:57.661397Z - Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
2025-10-01T03:53:57.661494Z - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
2025-10-01T03:53:57.971655Z Finished
2025-10-01T03:53:58.902014Z Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T03:53:58.902644Z
2025-10-01T03:54:00.00406Z No wrangler.toml file found. Continuing.
2025-10-01T03:54:00.004853Z Note: No functions dir at /functions found. Skipping.
2025-10-01T03:54:00.005031Z Validating asset output directory
2025-10-01T03:54:02.921454Z Deploying your site to Cloudflare's global network...
2025-10-01T03:54:04.234978Z Parsed 12 valid redirect rules.
2025-10-01T03:54:04.23545Z Found invalid redirect lines:
2025-10-01T03:54:04.235586Z - #2: /assets/* 200
2025-10-01T03:54:04.235698Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.235832Z - #3: /_.js 200
2025-10-01T03:54:04.235963Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.236072Z - #4: /_.css 200
2025-10-01T03:54:04.236172Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.236268Z - #5: /_.png 200
2025-10-01T03:54:04.236364Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.236453Z - #6: /_.jpg 200
2025-10-01T03:54:04.236511Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.236579Z - #7: /_.jpeg 200
2025-10-01T03:54:04.236641Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.236707Z - #8: /_.gif 200
2025-10-01T03:54:04.236768Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.236832Z - #9: /_.svg 200
2025-10-01T03:54:04.236919Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.236988Z - #10: /_.webp 200
2025-10-01T03:54:04.237046Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.237109Z - #11: /_.ico 200
2025-10-01T03:54:04.237199Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.237289Z - #12: /_.woff 200
2025-10-01T03:54:04.237378Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.237489Z - #13: /_.woff2 200
2025-10-01T03:54:04.237593Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.237689Z - #14: /_.ttf 200
2025-10-01T03:54:04.237786Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.237911Z - #15: /manifest.json 200
2025-10-01T03:54:04.238Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.238084Z - #16: /robots.txt 200
2025-10-01T03:54:04.238174Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.238271Z - #17: /sitemap*.xml 200
2025-10-01T03:54:04.238343Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.238413Z - #18: /sw.js 200
2025-10-01T03:54:04.238492Z URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").
2025-10-01T03:54:04.238594Z - #21: /restaurants/* /index.html 200
2025-10-01T03:54:04.238697Z Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-10-01T03:54:04.238808Z - #22: /events/_ /index.html 200
2025-10-01T03:54:04.238929Z Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-10-01T03:54:04.239046Z - #23: /playgrounds/_ /index.html 200
2025-10-01T03:54:04.239154Z Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-10-01T03:54:04.23925Z - #24: /attractions/_ /index.html 200
2025-10-01T03:54:04.23935Z Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-10-01T03:54:04.239451Z - #25: /neighborhoods/_ /index.html 200
2025-10-01T03:54:04.239516Z Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-10-01T03:54:04.239578Z - #26: /articles/_ /index.html 200
2025-10-01T03:54:04.239642Z Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-10-01T03:54:04.239703Z - #33: /admin/_ /index.html 200
2025-10-01T03:54:04.239759Z Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-10-01T03:54:04.239821Z - #44: /\* /index.html 200
2025-10-01T03:54:04.239896Z Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.
2025-10-01T03:54:04.239974Z Parsed 20 valid header rules.
2025-10-01T03:54:05.506127Z Uploading... (200/201)
2025-10-01T03:54:06.009556Z Uploading... (201/201)
2025-10-01T03:54:06.009891Z ✨ Success! Uploaded 1 files (200 already uploaded) (0.78 sec)
2025-10-01T03:54:06.010061Z
2025-10-01T03:54:06.895828Z ✨ Upload complete!
2025-10-01T03:54:09.199773Z Uploading to dependency cache
2025-10-01T03:54:09.254833Z Skipping build output cache as it's not supported for your project
2025-10-01T03:54:10.551816Z Success: Dependencies uploaded to build cache.
2025-10-01T03:54:12.272241Z Success: Assets published!
2025-10-01T03:54:14.308176Z Success: Your site was deployed!
