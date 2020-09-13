// Copyright (c) 2015, Derek Guenther
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0


const availableReviews = document.querySelector('#available-count');
const lessonEnd = document.querySelector('#lesson-ready-end');

if (availableReviews)
    new MutationObserver(mutations => {
        for (let mut of mutations) {
            if (!mut.addedNodes.length || !mut.addedNodes[0].data) continue;
            browser.storage.local.set({reviews_available: parseInt(mut.addedNodes[0].data, 10)})
        }
    }).observe(availableReviews, { childList: true });
if (lessonEnd)
    lessonEnd.addEventListener('click', () => browser.runtime.sendMessage({command: 'update-summary'}));
