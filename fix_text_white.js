const fs = require('fs');
const path = require('path');

const DARK_BGS = [
    'gradient-primary',
    'bg-primary',
    'bg-indigo-',
    'bg-violet-',
    'bg-emerald-',
    'bg-blue-',
    'bg-amber-600',
    'bg-amber-700',
    'bg-amber-800',
    'bg-amber-900',
    'bg-green-',
    'bg-red-',
    'bg-rose-',
    'bg-slate-800',
    'bg-slate-900',
    'bg-zinc-700',
    'bg-zinc-800',
    'bg-zinc-900',
    'bg-black',
    'bg-success',
    'bg-danger',
    'bg-warning',
    'bg-cyan-600',
    'bg-cyan-700',
    'bg-cyan-800',
    'bg-pink-'
];

function shouldKeepWhite(className) {
    for (const bg of DARK_BGS) {
        if (className.includes(bg)) {
            return true;
        }
    }
    return false;
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Regex to match className="...", className={'...'}, clsx("..."), etc.
    // A simpler approach is to find all string literals that contain 'text-white'
    const regex = /["'\`]([^"'\`]*text-white[^"'\`]*)(["'\`])/g;

    content = content.replace(regex, (match, innerText, quote) => {
        if (shouldKeepWhite(innerText)) {
            return match;
        }
        modified = true;
        return quote + innerText.replace(/\btext-white\b/g, 'text-foreground').replace(/\bhover:text-white\b/g, 'hover:text-foreground') + quote;
    });

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated:', filePath);
    }
}

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            processFile(fullPath);
        }
    }
}

walk(path.join(__dirname, 'apps/web/app'));
walk(path.join(__dirname, 'apps/web/components'));
