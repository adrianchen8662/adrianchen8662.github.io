import { useEffect, useState } from 'react';

interface Props {
  /** Text that stays put, e.g. "Hi, I'm Adrian Chen. I'm" */
  prefix: string;
  /** Endings typed and deleted in turn, each with its own "a" or "an" */
  phrases: string[];
}

/** Types each phrase after the prefix, then deletes it and moves on to the next */
export default function Typewriter({ prefix, phrases }: Props) {
  const [part, setPart] = useState(0);
  // Start with the first phrase in full, so the page reads correctly before scripts run
  const [length, setLength] = useState(phrases[0].length);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const phrase = phrases[part];
    let delay: number;
    let step: () => void;
    if (!deleting) {
      if (length < phrase.length) {
        delay = 100;
        step = () => setLength(length + 1);
      } else {
        delay = 1000;
        step = () => setDeleting(true);
      }
    } else if (length > 0) {
      delay = 50;
      step = () => setLength(length - 1);
    } else {
      delay = 200;
      step = () => {
        setPart((part + 1) % phrases.length);
        setDeleting(false);
      };
    }
    const timer = window.setTimeout(step, delay);
    return () => window.clearTimeout(timer);
  }, [part, length, deleting, phrases]);

  const spoken = `${prefix} ${phrases.map((p) => p.replace(/\.$/, '')).join(', ')}.`;

  return (
    <h1>
      <span className="sr-only">{spoken}</span>
      <span aria-hidden="true">
        {prefix} {phrases[part].slice(0, length)}
        <span className="caret" />
      </span>
    </h1>
  );
}
