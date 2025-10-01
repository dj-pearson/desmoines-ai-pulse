2025-10-01T04:20:26.072977052Z Cloning repository...
2025-10-01T04:20:27.310507768Z From https://github.com/dj-pearson/desmoines-ai-pulse
2025-10-01T04:20:27.310755395Z * branch da2125557f6bb039fd42f0a3e1585cbadf437e34 -> FETCH_HEAD
2025-10-01T04:20:27.310781557Z
2025-10-01T04:20:27.408816579Z HEAD is now at da21255 Refactor middleware for improved SPA routing and static asset handling
2025-10-01T04:20:27.409145727Z
2025-10-01T04:20:27.500535695Z
2025-10-01T04:20:27.500585714Z Using v2 root directory strategy
2025-10-01T04:20:27.523856804Z Success: Finished cloning repository files
2025-10-01T04:20:28.294338079Z Restoring from dependencies cache
2025-10-01T04:20:28.310428757Z Restoring from build output cache
2025-10-01T04:20:30.042117276Z Success: Dependencies restored from build cache.
2025-10-01T04:20:31.092136214Z Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T04:20:31.092543424Z
2025-10-01T04:20:32.209739249Z No wrangler.toml file found. Continuing.
2025-10-01T04:20:32.287077389Z Detected the following tools from environment: nodejs@20.18.0, npm@10.9.2
2025-10-01T04:20:32.287502965Z Installing nodejs 20.18.0
2025-10-01T04:20:33.406258748Z Trying to update node-build... ok
2025-10-01T04:20:33.506354928Z To follow progress, use 'tail -f /tmp/node-build.20251001042033.502.log' or pass --verbose
2025-10-01T04:20:33.601552417Z Downloading node-v20.18.0-linux-x64.tar.gz...
2025-10-01T04:20:33.862886146Z -> https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz
2025-10-01T04:20:35.618179956Z
2025-10-01T04:20:35.618586367Z WARNING: node-v20.18.0-linux-x64 is in LTS Maintenance mode and nearing its end of life.
2025-10-01T04:20:35.619164197Z It only receives *critical* security updates, *critical\* bug fixes and documentation updates.
2025-10-01T04:20:35.619187083Z
2025-10-01T04:20:35.619516225Z Installing node-v20.18.0-linux-x64...
2025-10-01T04:20:35.999919568Z Installed node-v20.18.0-linux-x64 to /opt/buildhome/.asdf/installs/nodejs/20.18.0
2025-10-01T04:20:36.000452079Z
2025-10-01T04:20:37.007346391Z Installing project dependencies: npm clean-install --progress=false
2025-10-01T04:20:40.326042572Z npm warn deprecated @types/dompurify@3.2.0: This is a stub types definition. dompurify provides its own type definitions, so you do not need this installed.
2025-10-01T04:20:41.787568804Z npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
2025-10-01T04:20:46.305174056Z npm warn deprecated three-mesh-bvh@0.7.8: Deprecated due to three.js version incompatibility. Please use v0.8.0, instead.
2025-10-01T04:21:01.617381967Z
2025-10-01T04:21:01.617672226Z added 695 packages, and audited 696 packages in 24s
2025-10-01T04:21:01.618086765Z
2025-10-01T04:21:01.618113424Z 103 packages are looking for funding
2025-10-01T04:21:01.618325866Z run `npm fund` for details
2025-10-01T04:21:01.638771286Z
2025-10-01T04:21:01.639091567Z 6 vulnerabilities (3 low, 3 moderate)
2025-10-01T04:21:01.639103112Z
2025-10-01T04:21:01.639401363Z To address all issues, run:
2025-10-01T04:21:01.639567434Z npm audit fix
2025-10-01T04:21:01.639653752Z
2025-10-01T04:21:01.640255155Z Run `npm audit` for details.
2025-10-01T04:21:01.665556809Z Executing user command: npm run build
2025-10-01T04:21:02.081540749Z
2025-10-01T04:21:02.081648986Z > vite_react_shadcn_ts@0.0.0 build
2025-10-01T04:21:02.081792122Z > vite build
2025-10-01T04:21:02.081871462Z
2025-10-01T04:21:02.358206184Z [36mvite v5.4.10 [32mbuilding for production...[36m[39m
2025-10-01T04:21:02.431155824Z transforming...
2025-10-01T04:21:19.481486849Z [32m✓[39m 4260 modules transformed.
2025-10-01T04:21:21.202626296Z rendering chunks...
2025-10-01T04:21:39.73167313Z computing gzip size...
2025-10-01T04:21:39.837662662Z [2mdist/[22m[32mindex.html [39m[1m[2m 14.97 kB[22m[1m[22m[2m │ gzip: 4.04 kB[22m
2025-10-01T04:21:39.837933435Z [2mdist/[22m[2massets/[22m[35mvendor-other-Dgihpmma.css [39m[1m[2m 15.04 kB[22m[1m[22m[2m │ gzip: 6.38 kB[22m
2025-10-01T04:21:39.837963435Z [2mdist/[22m[2massets/[22m[35mindex-IE542Gmw.css [39m[1m[2m 125.20 kB[22m[1m[22m[2m │ gzip: 19.50 kB[22m
2025-10-01T04:21:39.838253514Z [2mdist/[22m[2massets/[22m[36mvendor-ui-ByoYm48K.js [39m[1m[2m 0.25 kB[22m[1m[22m[2m │ gzip: 0.21 kB[22m[2m │ map: 1.25 kB[22m
2025-10-01T04:21:39.838455055Z [2mdist/[22m[2massets/[22m[36mskeleton-mGuZGEtJ.js [39m[1m[2m 0.26 kB[22m[1m[22m[2m │ gzip: 0.22 kB[22m[2m │ map: 0.55 kB[22m
2025-10-01T04:21:39.838614742Z [2mdist/[22m[2massets/[22m[36mseparator-Dae1tIj8.js [39m[1m[2m 0.42 kB[22m[1m[22m[2m │ gzip: 0.31 kB[22m[2m │ map: 1.29 kB[22m
2025-10-01T04:21:39.838920286Z [2mdist/[22m[2massets/[22m[36mlabel-DbpYWBHN.js [39m[1m[2m 0.42 kB[22m[1m[22m[2m │ gzip: 0.30 kB[22m[2m │ map: 1.17 kB[22m
2025-10-01T04:21:39.838935042Z [2mdist/[22m[2massets/[22m[36mclient-CuNO40hr.js [39m[1m[2m 0.44 kB[22m[1m[22m[2m │ gzip: 0.38 kB[22m[2m │ map: 1.14 kB[22m
2025-10-01T04:21:39.839509752Z [2mdist/[22m[2massets/[22m[36mprogress-DZNUXRMr.js [39m[1m[2m 0.48 kB[22m[1m[22m[2m │ gzip: 0.36 kB[22m[2m │ map: 1.38 kB[22m
2025-10-01T04:21:39.839525019Z [2mdist/[22m[2massets/[22m[36mtextarea-BziXp-7B.js [39m[1m[2m 0.57 kB[22m[1m[22m[2m │ gzip: 0.38 kB[22m[2m │ map: 1.13 kB[22m
2025-10-01T04:21:39.839678933Z [2mdist/[22m[2massets/[22m[36minput-e-4gUWzU.js [39m[1m[2m 0.66 kB[22m[1m[22m[2m │ gzip: 0.41 kB[22m[2m │ map: 1.16 kB[22m
2025-10-01T04:21:39.83990848Z [2mdist/[22m[2massets/[22m[36mcheckbox-Bq650Bpd.js [39m[1m[2m 0.72 kB[22m[1m[22m[2m │ gzip: 0.43 kB[22m[2m │ map: 1.63 kB[22m
2025-10-01T04:21:39.840179346Z [2mdist/[22m[2massets/[22m[36mslider-B3N1sq2i.js [39m[1m[2m 0.80 kB[22m[1m[22m[2m │ gzip: 0.47 kB[22m[2m │ map: 1.71 kB[22m
2025-10-01T04:21:39.840631343Z [2mdist/[22m[2massets/[22m[36mpopover-BBPRIcpx.js [39m[1m[2m 0.82 kB[22m[1m[22m[2m │ gzip: 0.45 kB[22m[2m │ map: 1.83 kB[22m
2025-10-01T04:21:39.841076527Z [2mdist/[22m[2massets/[22m[36mbadge-DZ0-1i3v.js [39m[1m[2m 0.83 kB[22m[1m[22m[2m │ gzip: 0.45 kB[22m[2m │ map: 1.70 kB[22m
2025-10-01T04:21:39.841089298Z [2mdist/[22m[2massets/[22m[36mswitch-Ds0ODq3k.js [39m[1m[2m 0.86 kB[22m[1m[22m[2m │ gzip: 0.48 kB[22m[2m │ map: 1.63 kB[22m
2025-10-01T04:21:39.84124061Z [2mdist/[22m[2massets/[22m[36malert-2sReonCP.js [39m[1m[2m 1.02 kB[22m[1m[22m[2m │ gzip: 0.54 kB[22m[2m │ map: 2.47 kB[22m
2025-10-01T04:21:39.841373997Z [2mdist/[22m[2massets/[22m[36merrorSuppression-LVnJe3hs.js [39m[1m[2m 1.08 kB[22m[1m[22m[2m │ gzip: 0.55 kB[22m[2m │ map: 4.33 kB[22m
2025-10-01T04:21:39.841611264Z [2mdist/[22m[2massets/[22m[36museProfile-ar63XZr0.js [39m[1m[2m 1.09 kB[22m[1m[22m[2m │ gzip: 0.58 kB[22m[2m │ map: 4.51 kB[22m
2025-10-01T04:21:39.841632037Z [2mdist/[22m[2massets/[22m[36mtabs-Do7v7h8b.js [39m[1m[2m 1.16 kB[22m[1m[22m[2m │ gzip: 0.51 kB[22m[2m │ map: 2.70 kB[22m
2025-10-01T04:21:39.841674944Z [2mdist/[22m[2massets/[22m[36mAIWriteup-Cz2Aju73.js [39m[1m[2m 1.35 kB[22m[1m[22m[2m │ gzip: 0.72 kB[22m[2m │ map: 3.15 kB[22m
2025-10-01T04:21:39.84176489Z [2mdist/[22m[2massets/[22m[36musePlaygrounds-CcQa7Amw.js [39m[1m[2m 1.39 kB[22m[1m[22m[2m │ gzip: 0.65 kB[22m[2m │ map: 5.68 kB[22m
2025-10-01T04:21:39.841902009Z [2mdist/[22m[2massets/[22m[36museSocialFeatures-C6u7xR9M.js [39m[1m[2m 1.48 kB[22m[1m[22m[2m │ gzip: 0.66 kB[22m[2m │ map: 9.52 kB[22m
2025-10-01T04:21:39.842043099Z [2mdist/[22m[2massets/[22m[36museAuth-QYBUzbbh.js [39m[1m[2m 1.49 kB[22m[1m[22m[2m │ gzip: 0.73 kB[22m[2m │ map: 6.23 kB[22m
2025-10-01T04:21:39.842077848Z [2mdist/[22m[2massets/[22m[36museAttractions-D1JZsT8f.js [39m[1m[2m 1.50 kB[22m[1m[22m[2m │ gzip: 0.70 kB[22m[2m │ map: 6.15 kB[22m
2025-10-01T04:21:39.842253548Z [2mdist/[22m[2massets/[22m[36mFAQSection-C13Mv9Kx.js [39m[1m[2m 1.51 kB[22m[1m[22m[2m │ gzip: 0.77 kB[22m[2m │ map: 4.75 kB[22m
2025-10-01T04:21:39.842298223Z [2mdist/[22m[2massets/[22m[36mtimezone-BBSHPwJT.js [39m[1m[2m 1.59 kB[22m[1m[22m[2m │ gzip: 0.63 kB[22m[2m │ map: 7.93 kB[22m
2025-10-01T04:21:39.842427909Z [2mdist/[22m[2massets/[22m[36museUserSubmittedEvents-BsAcSf-1.js [39m[1m[2m 1.61 kB[22m[1m[22m[2m │ gzip: 0.65 kB[22m[2m │ map: 6.58 kB[22m
2025-10-01T04:21:39.842561583Z [2mdist/[22m[2massets/[22m[36museEvents-CIimIxwo.js [39m[1m[2m 1.68 kB[22m[1m[22m[2m │ gzip: 0.79 kB[22m[2m │ map: 7.28 kB[22m
2025-10-01T04:21:39.842647028Z [2mdist/[22m[2massets/[22m[36museSupabase-\_N6Yn2UJ.js [39m[1m[2m 1.78 kB[22m[1m[22m[2m │ gzip: 0.80 kB[22m[2m │ map: 9.68 kB[22m
2025-10-01T04:21:39.842784606Z [2mdist/[22m[2massets/[22m[36mcalendar-BlzaO1V7.js [39m[1m[2m 1.91 kB[22m[1m[22m[2m │ gzip: 0.85 kB[22m[2m │ map: 3.97 kB[22m
2025-10-01T04:21:39.84279931Z [2mdist/[22m[2massets/[22m[36mperformance-DRNioTBP.js [39m[1m[2m 1.97 kB[22m[1m[22m[2m │ gzip: 0.89 kB[22m[2m │ map: 9.57 kB[22m
2025-10-01T04:21:39.842977455Z [2mdist/[22m[2massets/[22m[36mNotFound-fcgUXwQw.js [39m[1m[2m 2.00 kB[22m[1m[22m[2m │ gzip: 0.92 kB[22m[2m │ map: 4.16 kB[22m
2025-10-01T04:21:39.842993348Z [2mdist/[22m[2massets/[22m[36malert-dialog-CVSL9VBV.js [39m[1m[2m 2.08 kB[22m[1m[22m[2m │ gzip: 0.78 kB[22m[2m │ map: 6.41 kB[22m
2025-10-01T04:21:39.843214863Z [2mdist/[22m[2massets/[22m[36mloading-skeleton-Dz2JPz5U.js [39m[1m[2m 2.16 kB[22m[1m[22m[2m │ gzip: 0.80 kB[22m[2m │ map: 8.21 kB[22m
2025-10-01T04:21:39.843381218Z [2mdist/[22m[2massets/[22m[36mdialog-BQ_a3x37.js [39m[1m[2m 2.23 kB[22m[1m[22m[2m │ gzip: 0.89 kB[22m[2m │ map: 5.48 kB[22m
2025-10-01T04:21:39.843518286Z [2mdist/[22m[2massets/[22m[36museCampaigns-CcpIkXym.js [39m[1m[2m 2.31 kB[22m[1m[22m[2m │ gzip: 0.91 kB[22m[2m │ map: 8.66 kB[22m
2025-10-01T04:21:39.843595172Z [2mdist/[22m[2massets/[22m[36mselect-De5Ji6QN.js [39m[1m[2m 3.00 kB[22m[1m[22m[2m │ gzip: 1.11 kB[22m[2m │ map: 8.01 kB[22m
2025-10-01T04:21:39.843668957Z [2mdist/[22m[2massets/[22m[36museRestaurants-B9D5ItOR.js [39m[1m[2m 3.05 kB[22m[1m[22m[2m │ gzip: 1.12 kB[22m[2m │ map: 12.18 kB[22m
2025-10-01T04:21:39.843886494Z [2mdist/[22m[2massets/[22m[36museArticles-JSsQoSYB.js [39m[1m[2m 3.21 kB[22m[1m[22m[2m │ gzip: 1.11 kB[22m[2m │ map: 11.38 kB[22m
2025-10-01T04:21:39.843915966Z [2mdist/[22m[2massets/[22m[36mEventPhotoUpload-BhTcVBf0.js [39m[1m[2m 3.48 kB[22m[1m[22m[2m │ gzip: 1.58 kB[22m[2m │ map: 11.37 kB[22m
2025-10-01T04:21:39.844068335Z [2mdist/[22m[2massets/[22m[36mCampaignDashboard-p_oPsR8C.js [39m[1m[2m 3.89 kB[22m[1m[22m[2m │ gzip: 1.29 kB[22m[2m │ map: 8.94 kB[22m
2025-10-01T04:21:39.844210383Z [2mdist/[22m[2massets/[22m[36museCommunityFeatures-BhqV23bJ.js [39m[1m[2m 4.55 kB[22m[1m[22m[2m │ gzip: 1.50 kB[22m[2m │ map: 17.48 kB[22m
2025-10-01T04:21:39.844223026Z [2mdist/[22m[2massets/[22m[36mSEOHead-BXairrZU.js [39m[1m[2m 4.58 kB[22m[1m[22m[2m │ gzip: 1.52 kB[22m[2m │ map: 12.43 kB[22m
2025-10-01T04:21:39.844315716Z [2mdist/[22m[2massets/[22m[36mLocalSEO-CToWAuBV.js [39m[1m[2m 5.02 kB[22m[1m[22m[2m │ gzip: 1.62 kB[22m[2m │ map: 12.41 kB[22m
2025-10-01T04:21:39.844394238Z [2mdist/[22m[2massets/[22m[36mShareDialog-ByVb1X5c.js [39m[1m[2m 5.18 kB[22m[1m[22m[2m │ gzip: 2.51 kB[22m[2m │ map: 11.47 kB[22m
2025-10-01T04:21:39.844587248Z [2mdist/[22m[2massets/[22m[36mEnhancedLocalSEO-dugKrai4.js [39m[1m[2m 5.37 kB[22m[1m[22m[2m │ gzip: 1.69 kB[22m[2m │ map: 16.66 kB[22m
2025-10-01T04:21:39.844636903Z [2mdist/[22m[2massets/[22m[36mWeekendPage-C3wYCQre.js [39m[1m[2m 5.56 kB[22m[1m[22m[2m │ gzip: 2.16 kB[22m[2m │ map: 14.76 kB[22m
2025-10-01T04:21:39.844819589Z [2mdist/[22m[2massets/[22m[36mAttractionDetails-fsl6KQK9.js [39m[1m[2m 6.13 kB[22m[1m[22m[2m │ gzip: 2.23 kB[22m[2m │ map: 16.30 kB[22m
2025-10-01T04:21:39.844830116Z [2mdist/[22m[2massets/[22m[36mPlaygroundDetails-BwD0jHKz.js [39m[1m[2m 6.51 kB[22m[1m[22m[2m │ gzip: 2.17 kB[22m[2m │ map: 17.43 kB[22m
2025-10-01T04:21:39.844901929Z [2mdist/[22m[2massets/[22m[36mEventsToday-M9NVRjii.js [39m[1m[2m 6.72 kB[22m[1m[22m[2m │ gzip: 2.30 kB[22m[2m │ map: 13.94 kB[22m
2025-10-01T04:21:39.845072497Z [2mdist/[22m[2massets/[22m[36mEventCard-n4ZkLL7w.js [39m[1m[2m 7.14 kB[22m[1m[22m[2m │ gzip: 2.39 kB[22m[2m │ map: 23.52 kB[22m
2025-10-01T04:21:39.845147286Z [2mdist/[22m[2massets/[22m[36mArticleDetails-CqkDoRzf.js [39m[1m[2m 7.48 kB[22m[1m[22m[2m │ gzip: 2.32 kB[22m[2m │ map: 18.28 kB[22m
2025-10-01T04:21:39.845343296Z [2mdist/[22m[2massets/[22m[36mAuth-BlOkecQ0.js [39m[1m[2m 7.71 kB[22m[1m[22m[2m │ gzip: 2.46 kB[22m[2m │ map: 21.63 kB[22m
2025-10-01T04:21:39.845486044Z [2mdist/[22m[2massets/[22m[36mNeighborhoodsPage-BhHTWR_d.js [39m[1m[2m 7.82 kB[22m[1m[22m[2m │ gzip: 2.54 kB[22m[2m │ map: 14.84 kB[22m
2025-10-01T04:21:39.845523623Z [2mdist/[22m[2massets/[22m[36mAttractions-ByD639hx.js [39m[1m[2m 8.35 kB[22m[1m[22m[2m │ gzip: 2.85 kB[22m[2m │ map: 22.36 kB[22m
2025-10-01T04:21:39.845740301Z [2mdist/[22m[2massets/[22m[36mMonthlyEventsPage-CEJdTEZv.js [39m[1m[2m 8.39 kB[22m[1m[22m[2m │ gzip: 2.84 kB[22m[2m │ map: 20.27 kB[22m
2025-10-01T04:21:39.845752247Z [2mdist/[22m[2massets/[22m[36mEventsByLocation-CKNUYysb.js [39m[1m[2m 8.87 kB[22m[1m[22m[2m │ gzip: 2.99 kB[22m[2m │ map: 20.21 kB[22m
2025-10-01T04:21:39.845885114Z [2mdist/[22m[2massets/[22m[36mGuidesPage-BOkrMT28.js [39m[1m[2m 9.02 kB[22m[1m[22m[2m │ gzip: 2.86 kB[22m[2m │ map: 16.75 kB[22m
2025-10-01T04:21:39.846161364Z [2mdist/[22m[2massets/[22m[36mEventsThisWeekend-Dl12IMh2.js [39m[1m[2m 9.07 kB[22m[1m[22m[2m │ gzip: 2.90 kB[22m[2m │ map: 23.21 kB[22m
2025-10-01T04:21:39.846176628Z [2mdist/[22m[2massets/[22m[36mAdminArticleEditor-CtIoIDTm.js [39m[1m[2m 9.51 kB[22m[1m[22m[2m │ gzip: 3.04 kB[22m[2m │ map: 28.03 kB[22m
2025-10-01T04:21:39.846245386Z [2mdist/[22m[2massets/[22m[36mArticles-BoSZr46y.js [39m[1m[2m 9.65 kB[22m[1m[22m[2m │ gzip: 3.11 kB[22m[2m │ map: 25.08 kB[22m
2025-10-01T04:21:39.846485394Z [2mdist/[22m[2massets/[22m[36mPlaygrounds-Bu7Tbxjl.js [39m[1m[2m 10.42 kB[22m[1m[22m[2m │ gzip: 3.53 kB[22m[2m │ map: 29.03 kB[22m
2025-10-01T04:21:39.846499734Z [2mdist/[22m[2massets/[22m[36mRestaurantsPage-C22cFCFU.js [39m[1m[2m 10.52 kB[22m[1m[22m[2m │ gzip: 3.47 kB[22m[2m │ map: 28.69 kB[22m
2025-10-01T04:21:39.846623004Z [2mdist/[22m[2massets/[22m[36mSmartCalendarIntegration-DOYQO9Pq.js [39m[1m[2m 11.06 kB[22m[1m[22m[2m │ gzip: 3.16 kB[22m[2m │ map: 34.84 kB[22m
2025-10-01T04:21:39.846743743Z [2mdist/[22m[2massets/[22m[36mProfile-yxsZ2DMK.js [39m[1m[2m 11.52 kB[22m[1m[22m[2m │ gzip: 3.27 kB[22m[2m │ map: 28.56 kB[22m
2025-10-01T04:21:39.846871254Z [2mdist/[22m[2massets/[22m[36mRestaurantDetails-C4ZLVgWy.js [39m[1m[2m 14.38 kB[22m[1m[22m[2m │ gzip: 3.92 kB[22m[2m │ map: 38.88 kB[22m
2025-10-01T04:21:39.847063391Z [2mdist/[22m[2massets/[22m[36museEventSocial-Wm72l2Wl.js [39m[1m[2m 14.54 kB[22m[1m[22m[2m │ gzip: 4.30 kB[22m[2m │ map: 42.49 kB[22m
2025-10-01T04:21:39.847099496Z [2mdist/[22m[2massets/[22m[36mUserDashboard-BXWPl9wD.js [39m[1m[2m 15.27 kB[22m[1m[22m[2m │ gzip: 4.38 kB[22m[2m │ map: 39.51 kB[22m
2025-10-01T04:21:39.847287154Z [2mdist/[22m[2massets/[22m[36mGamification-D7P4hM0u.js [39m[1m[2m 18.15 kB[22m[1m[22m[2m │ gzip: 4.82 kB[22m[2m │ map: 50.69 kB[22m
2025-10-01T04:21:39.847404877Z [2mdist/[22m[2massets/[22m[36mAdvertise-DWBO_Ggc.js [39m[1m[2m 18.30 kB[22m[1m[22m[2m │ gzip: 4.81 kB[22m[2m │ map: 42.21 kB[22m
2025-10-01T04:21:39.847662066Z [2mdist/[22m[2massets/[22m[36mEventsPage-djr1RbAl.js [39m[1m[2m 18.46 kB[22m[1m[22m[2m │ gzip: 5.78 kB[22m[2m │ map: 52.48 kB[22m
2025-10-01T04:21:39.847675121Z [2mdist/[22m[2massets/[22m[36mIowaStateFairPage-CLGNM8M0.js [39m[1m[2m 18.61 kB[22m[1m[22m[2m │ gzip: 5.05 kB[22m[2m │ map: 35.39 kB[22m
2025-10-01T04:21:39.847827978Z [2mdist/[22m[2massets/[22m[36mNeighborhoodPage-DdnL8ftS.js [39m[1m[2m 19.02 kB[22m[1m[22m[2m │ gzip: 5.35 kB[22m[2m │ map: 35.14 kB[22m
2025-10-01T04:21:39.847845061Z [2mdist/[22m[2massets/[22m[36mSocial-qJTfryXF.js [39m[1m[2m 22.03 kB[22m[1m[22m[2m │ gzip: 5.10 kB[22m[2m │ map: 64.79 kB[22m
2025-10-01T04:21:39.848023144Z [2mdist/[22m[2massets/[22m[36mindex-DvtDXccV.js [39m[1m[2m 22.62 kB[22m[1m[22m[2m │ gzip: 7.05 kB[22m[2m │ map: 47.51 kB[22m
2025-10-01T04:21:39.848077741Z [2mdist/[22m[2massets/[22m[36mAdvancedSearchPage-CnHSOv-F.js [39m[1m[2m 24.01 kB[22m[1m[22m[2m │ gzip: 6.36 kB[22m[2m │ map: 77.43 kB[22m
2025-10-01T04:21:39.848248292Z [2mdist/[22m[2massets/[22m[36mFooter-Bxr8WUVN.js [39m[1m[2m 25.30 kB[22m[1m[22m[2m │ gzip: 6.90 kB[22m[2m │ map: 68.29 kB[22m
2025-10-01T04:21:39.848261148Z [2mdist/[22m[2massets/[22m[36mRestaurants-DNwgtMPV.js [39m[1m[2m 26.38 kB[22m[1m[22m[2m │ gzip: 7.24 kB[22m[2m │ map: 63.75 kB[22m
2025-10-01T04:21:39.848398105Z [2mdist/[22m[2massets/[22m[36mBusinessPartnership-B0mYi05z.js [39m[1m[2m 26.66 kB[22m[1m[22m[2m │ gzip: 5.98 kB[22m[2m │ map: 71.57 kB[22m
2025-10-01T04:21:39.848550143Z [2mdist/[22m[2massets/[22m[36mRealTimePage-FC6oC0aD.js [39m[1m[2m 29.16 kB[22m[1m[22m[2m │ gzip: 7.34 kB[22m[2m │ map: 67.10 kB[22m
2025-10-01T04:21:39.848762854Z [2mdist/[22m[2massets/[22m[36mEventDetails-CLjwCNlT.js [39m[1m[2m 29.30 kB[22m[1m[22m[2m │ gzip: 7.85 kB[22m[2m │ map: 85.87 kB[22m
2025-10-01T04:21:39.848828881Z [2mdist/[22m[2massets/[22m[36mvendor-query-BVjCvOi4.js [39m[1m[2m 34.48 kB[22m[1m[22m[2m │ gzip: 9.87 kB[22m[2m │ map: 126.36 kB[22m
2025-10-01T04:21:39.848998253Z [2mdist/[22m[2massets/[22m[36mvendor-date-CZLXoD8C.js [39m[1m[2m 35.26 kB[22m[1m[22m[2m │ gzip: 10.28 kB[22m[2m │ map: 282.47 kB[22m
2025-10-01T04:21:39.849080232Z [2mdist/[22m[2massets/[22m[36mIndex-DjoKO2Z2.js [39m[1m[2m 94.58 kB[22m[1m[22m[2m │ gzip: 23.96 kB[22m[2m │ map: 292.87 kB[22m
2025-10-01T04:21:39.849208592Z [2mdist/[22m[2massets/[22m[36mvendor-supabase-CHM5h-i2.js [39m[1m[2m 114.22 kB[22m[1m[22m[2m │ gzip: 30.12 kB[22m[2m │ map: 495.43 kB[22m
2025-10-01T04:21:39.84938178Z [2mdist/[22m[2massets/[22m[36mAdmin-BB1useVz.js [39m[1m[2m 315.65 kB[22m[1m[22m[2m │ gzip: 65.06 kB[22m[2m │ map: 942.46 kB[22m
2025-10-01T04:21:39.849475732Z [2mdist/[22m[2massets/[22m[36mvendor-react-BJUTLwRx.js [39m[1m[33m1,010.25 kB[39m[22m[2m │ gzip: 289.03 kB[22m[2m │ map: 3,447.24 kB[22m
2025-10-01T04:21:39.849558192Z [2mdist/[22m[2massets/[22m[36mvendor-other-BlNzYQKF.js [39m[1m[33m1,273.24 kB[39m[22m[2m │ gzip: 334.43 kB[22m[2m │ map: 5,121.47 kB[22m
2025-10-01T04:21:39.849731217Z [32m✓ built in 37.45s[39m
2025-10-01T04:21:39.849881229Z [33m
2025-10-01T04:21:39.849893966Z (!) Some chunks are larger than 600 kB after minification. Consider:
2025-10-01T04:21:39.850002599Z - Using dynamic import() to code-split the application
2025-10-01T04:21:39.850131404Z - Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
2025-10-01T04:21:39.850233629Z - Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
2025-10-01T04:21:40.147359705Z Finished
2025-10-01T04:21:41.0583009Z Checking for configuration in a Wrangler configuration file (BETA)
2025-10-01T04:21:41.059103722Z
2025-10-01T04:21:42.162495126Z No wrangler.toml file found. Continuing.
2025-10-01T04:21:42.16316732Z Found Functions directory at /functions. Uploading.
2025-10-01T04:21:42.168730822Z ⛅️ wrangler 3.101.0
2025-10-01T04:21:42.169086875Z -------------------
2025-10-01T04:21:43.08862399Z ✨ Compiled Worker successfully
2025-10-01T04:21:44.175506467Z Found \_routes.json in output directory. Uploading.
2025-10-01T04:21:44.190630438Z Validating asset output directory
2025-10-01T04:21:47.110351836Z Deploying your site to Cloudflare's global network...
2025-10-01T04:21:49.658501212Z Parsed 20 valid header rules.
2025-10-01T04:21:51.025991224Z Uploading... (198/200)
2025-10-01T04:21:51.678247586Z Uploading... (199/200)
2025-10-01T04:21:51.80414897Z Uploading... (200/200)
2025-10-01T04:21:51.804510248Z ✨ Success! Uploaded 2 files (198 already uploaded) (1.14 sec)
2025-10-01T04:21:51.804527813Z
2025-10-01T04:21:53.077536539Z ✨ Upload complete!
2025-10-01T04:21:56.270097395Z Skipping build output cache as it's not supported for your project
2025-10-01T04:21:57.420973Z Success: Assets published!
2025-10-01T04:21:59.96689Z Success: Your site was deployed!
