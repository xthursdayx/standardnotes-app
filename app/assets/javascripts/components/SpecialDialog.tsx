import { FunctionComponent } from 'preact';
import { DialogOverlay, DialogContent } from '@reach/dialog';
import { Illustration, IllustrationType } from './Illustration';
import { Icon } from './Icon';
import { useRef } from 'preact/hooks';

export type SpecialDialogProps = {
  open?: boolean;
  onDismiss?: () => void;
  illustration?: IllustrationType;
  title: string;
  body: string;
  primaryButtonText: string;
  onPrimaryButtonClick?: () => void;
  primaryButtonHref?: string;
  secondaryButtonText?: string;
  onSecondaryButtonClick?: () => void;
};

export const SpecialDialog: FunctionComponent<SpecialDialogProps> = ({
  open,
  onDismiss,
  illustration,
  title,
  body,
  primaryButtonText,
  onPrimaryButtonClick,
  primaryButtonHref,
  secondaryButtonText,
  onSecondaryButtonClick,
}) => {
  const primaryButtonLinkRef = useRef<HTMLAnchorElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <DialogOverlay
      isOpen={open}
      onDismiss={onDismiss}
      className="z-index-10000 flex sn-component"
      initialFocusRef={primaryButtonLinkRef || primaryButtonRef}
    >
      <DialogContent className="bg-default w-89 opacity-100 rounded p-4">
        <div className="flex justify-end w-full">
          <button
            label="Ignore"
            className="border-0 m-0 p-0 bg-transparent cursor-pointer rounded-md flex color-neutral hover:color-info"
            onClick={onDismiss}
          >
            <Icon type="close" className="color-neutral" />
          </button>
        </div>
        <div className="flex flex-col items-center px-5 pb-5">
          {illustration && (
            <Illustration type={illustration} className="mb-4" />
          )}
          <h1 className="text-lg m-0">{title}</h1>
          <p className="text-sm text-center mt-2">{body}</p>
          {primaryButtonHref ? (
            <a
              ref={primaryButtonLinkRef}
              className="sn-button info w-full mt-4 text-center focus:padded-ring-info"
              target="_blank"
              href={primaryButtonHref}
            >
              {primaryButtonText}
            </a>
          ) : (
            <button
              ref={primaryButtonRef}
              className="sn-button info w-full mt-4 focus:padded-ring-info"
              onClick={onPrimaryButtonClick}
            >
              {primaryButtonText}
            </button>
          )}
          {secondaryButtonText && (
            <button
              className="sn-button outlined w-full mt-3 focus:padded-ring-info"
              onClick={onSecondaryButtonClick}
            >
              {secondaryButtonText}
            </button>
          )}
        </div>
      </DialogContent>
    </DialogOverlay>
  );
};
