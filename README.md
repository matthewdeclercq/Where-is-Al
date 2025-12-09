# Where Is Al

A simple, lightweight website for tracking Al's Appalachian Trail thru-hike adventure.

## Overview

"Where Is Al" is a single-purpose website that lets friends and family follow Al's Appalachian Trail journey in near real-time. The site features:

- Password-protected access with an inside-joke phrase
- Live map showing Al's current location (via Garmin inReach MapShare)
- Trail statistics dashboard
- Captain's Log section for updates and photos


## File Structure

```
Where-is-Al/
├── index.html          # Password gate entry point
├── main.html           # Main content page
├── css/
│   └── style.css      # Main stylesheet
├── js/
│   ├── password.js    # Password validation logic
│   ├── main.js        # Main page functionality
│   └── theme.js       # Dark theme switcher
├── .nojekyll          # GitHub Pages configuration
├── CNAME              # Custom domain configuration
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

## Customization

### Adding the Garmin Map

1. Get your Garmin MapShare or Explore public URL
2. Open `main.html`
3. Find the map placeholder section (around line 20)
4. Replace the placeholder div with an iframe:
   ```html
   <iframe src="YOUR_GARMIN_MAPSHARE_URL" width="100%" height="600" frameborder="0"></iframe>
   ```
5. Uncomment the auto-refresh code in `js/main.js` if needed

### Updating Stats

When you have a data source for trail statistics, update the stat cards in `main.html` and add JavaScript in `js/main.js` to populate the values dynamically.

### Adding Log Entries

The Captain's Log section is ready for photo and text entries. Add entries to the `log-grid` div in `main.html` using the prepared grid layout.


## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Gracefully degrades for older browsers

## License

Personal project - all rights reserved.

