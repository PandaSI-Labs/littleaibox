(function () {
    try {
        var preset = 'light';

        var utsRaw = localStorage.getItem('userThemeSettings');
        if (utsRaw) {
            try {
                var uts = JSON.parse(utsRaw);
                if (uts && typeof uts === 'object' && uts.preset) {
                    preset = uts.preset;
                }
            } catch (_) { }
        } else {
            var gtsRaw = localStorage.getItem('guestThemeSettings');
            if (gtsRaw) {
                try {
                    var gts = JSON.parse(gtsRaw);
                    if (gts && typeof gts === 'object' && gts.preset) {
                        preset = gts.preset;
                    }
                } catch (_) { }
            } else {
                var userPreset = localStorage.getItem('userThemePreset');
                if (userPreset) {
                    preset = userPreset;
                }
            }
        }

        document.documentElement.setAttribute('data-theme', preset);

        var style = document.createElement('style');
        style.id = 'pre-theme-style';
        var bg = preset === 'dark' ? '#1e1e1e' : '#ffffff';
        var colorScheme = preset === 'dark' ? 'dark' : 'light';
        style.textContent = 'html,body{background-color:' + bg + ';}';
        document.head.appendChild(style);
        try {
            document.documentElement.style.setProperty('color-scheme', colorScheme);
        } catch (_) { }
    } catch (e) {
        document.documentElement.setAttribute('data-theme', 'light');
        try {
            var fallbackStyle = document.createElement('style');
            fallbackStyle.textContent = 'html,body{background-color:#ffffff;}';
            document.head.appendChild(fallbackStyle);
        } catch (_) { }
    }
})();
