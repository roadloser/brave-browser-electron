export const ruleSources = [
  { id: 'easylist', url: 'https://easylist.to/easylist/easylist.txt' },
  { id: 'easyprivacy', url: 'https://easylist.to/easylist/easyprivacy.txt' },
  { id: 'ubo-unbreak', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt' },
  { id: 'ubo-filters', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt' },
] as const;

export const resourceSource = {
  id: 'ghostery-resources-2.20.3',
  url: 'https://raw.githubusercontent.com/ghostery/adblocker/6f0610bf5eec1f31c4975ce0e707cdf47023e5b5/packages/adblocker/assets/ublock-origin/resources.json',
};
