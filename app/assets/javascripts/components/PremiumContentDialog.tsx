import { AppState } from '@/ui_models/app_state';
import { SpecialDialog } from './SpecialDialog';
import { Strings } from '@/strings';
import { toDirective } from './utils';
import { observer } from 'mobx-react-lite';

type Props = {
  appState: AppState;
};

const PremiumContentDialog = observer(({ appState }: Props) =>{
  const { isPremiumContentModalVisible } = appState;
  console.log(isPremiumContentModalVisible);

  return (
    <SpecialDialog
      open={isPremiumContentModalVisible}
      onDismiss={() => appState.closePremiumContentModal()}
      illustration="premium"
      title={Strings.premiumContentTitle}
      body={Strings.premiumContentText}
      primaryButtonText="See plans"
      primaryButtonHref="https://standardnotes.com/plans"
      secondaryButtonText="No, thanks"
      onSecondaryButtonClick={() => appState.closePremiumContentModal()}
    />
  );
});

export const PremiumContentDialogDirective = toDirective(PremiumContentDialog);
