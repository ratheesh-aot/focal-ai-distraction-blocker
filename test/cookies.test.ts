import { describe, expect, it } from 'vitest';
import { findRejectButton } from '../src/content/cookies';
import { loadHtml } from './helpers';

const banner = (inner: string) => loadHtml(`<body><div id="b">We use cookies. ${inner}</div></body>`).getElementById('b')!;

describe('findRejectButton', () => {
  it('picks "Reject all", never "Accept all"', () => {
    const b = banner('<button id="a">Accept all</button><button id="r">Reject all</button>');
    expect(findRejectButton(b)?.id).toBe('r');
  });

  it('understands "only necessary" wording, even with "accept" in it', () => {
    expect(findRejectButton(banner('<button>Accept all</button><button id="n">Only necessary cookies</button>'))?.id).toBe('n');
    expect(findRejectButton(banner('<button>Accept all</button><button id="n">Accept necessary only</button>'))?.id).toBe('n');
  });

  it('understands other languages', () => {
    expect(findRejectButton(banner('<button>Alle akzeptieren</button><button id="de">Alle ablehnen</button>'))?.id).toBe('de');
    expect(findRejectButton(banner('<button>Tout accepter</button><a id="fr" href="#">Tout refuser</a>'))?.id).toBe('fr');
  });

  it('finds role=button elements and input buttons', () => {
    expect(findRejectButton(banner('<span role="button" id="s">Decline</span>'))?.id).toBe('s');
    expect(findRejectButton(banner('<input type="button" id="i" value="Reject">'))?.id).toBe('i');
  });

  it('returns null when only accept-type buttons exist', () => {
    expect(findRejectButton(banner('<button>Accept all</button><button>Got it</button><button>Manage options</button>'))).toBeNull();
  });

  it('prefers "reject all" over a weaker match', () => {
    const b = banner('<button id="d">Decline optional</button><button id="r">Reject all</button>');
    expect(findRejectButton(b)?.id).toBe('r');
  });
});
