import error from './error.js';
import inviteIncoming from './invite-incoming.js';
import afk from './afk.js';
import moneyRequest from './money-request.js';
import order from './order.js';
import endgame from './endgame.js';
import debt from './debt.js';
import court from './court.js';
import jokiDadu from './joki-dadu.js';
import toll from './toll.js';
import buy from './buy.js';
import takeover from './takeover.js';
import upgrade from './upgrade.js';
import choice from './choice.js';
import keep from './keep.js';
import pick from './pick.js';
import loanOffer from './loan-offer.js';
import trade from './trade.js';
import cardContinue from './card-continue.js';
import preRoll from './pre-roll.js';
import roll from './roll.js';
import lobbyConfigure from './lobby-configure.js';
import lobbyInvite from './lobby-invite.js';
import lobbyStart from './lobby-start.js';
import joinPage from './join-page.js';
import online from './online.js';
import home from './home.js';

/** Daftar handler, urut menurut priority (kecil = dicek lebih dulu). */
export const handlers = [
  error,
  inviteIncoming,
  afk,
  moneyRequest,
  order,
  endgame,
  debt,
  court,
  jokiDadu,
  toll,
  buy,
  takeover,
  upgrade,
  choice,
  keep,
  pick,
  loanOffer,
  trade,
  cardContinue,
  preRoll,
  roll,
  lobbyConfigure,
  lobbyInvite,
  lobbyStart,
  joinPage,
  online,
  home,
].sort((a, b) => a.priority - b.priority);

export default handlers;
