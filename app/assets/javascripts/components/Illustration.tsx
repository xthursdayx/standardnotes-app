import NotesIllustration from '../../illustrations/il-notes.svg';
import PremiumIllustration from '../../illustrations/il-premium.svg';

import { toDirective } from './utils';
import { FunctionalComponent } from 'preact';

const ILLUSTRATIONS = {
  notes: NotesIllustration,
  premium: PremiumIllustration,
};

export type IllustrationType = keyof typeof ILLUSTRATIONS;

type Props = {
  type: IllustrationType;
  className?: string;
};

export const Illustration: FunctionalComponent<Props> = ({ type, className }) => {
  const IllustrationComponent = ILLUSTRATIONS[type];
  return <IllustrationComponent className={className} />;
};

export const IllustrationDirective = toDirective<Props>(Illustration, {
  type: '@',
  className: '@',
});
