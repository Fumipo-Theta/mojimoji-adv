import type { ClientMessage, Role, ServerMessage } from '@mojimoji/protocol';

export interface Peer {
  readonly id: number;
  role: Role;
  room: string | null;
  send(message: ServerMessage): void;
}

/**
 * ルーム管理。
 *
 * display 端末と scanner 端末を 4 桁のコードで結びつけ、片方から来た
 * メッセージをもう片方へ中継するだけ。サーバーはゲームの状態を一切持たない
 * ので、通信が切れてもゲームの進行は display 側に残る。
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Set<Peer>>();

  join(peer: Peer, room: string, role: Role): void {
    this.leave(peer);
    peer.room = room;
    peer.role = role;

    let members = this.rooms.get(room);
    if (!members) {
      members = new Set();
      this.rooms.set(room, members);
    }
    members.add(peer);
    this.broadcastState(room);
  }

  leave(peer: Peer): void {
    if (!peer.room) return;
    const members = this.rooms.get(peer.room);
    const room = peer.room;
    peer.room = null;
    if (!members) return;

    members.delete(peer);
    if (members.size === 0) {
      this.rooms.delete(room);
    } else {
      this.broadcastState(room);
    }
  }

  /** 送信者以外の同室メンバーへ中継する */
  relay(peer: Peer, payload: ClientMessage): void {
    if (!peer.room) {
      peer.send({ type: 'room.error', message: 'ルームに参加していません' });
      return;
    }
    const members = this.rooms.get(peer.room);
    if (!members) return;
    const message: ServerMessage = { type: 'relay', from: peer.role, payload };
    for (const member of members) {
      if (member !== peer) member.send(message);
    }
  }

  private broadcastState(room: string): void {
    const members = this.rooms.get(room);
    if (!members) return;
    const state: ServerMessage = {
      type: 'room.state',
      room,
      members: [...members].map((m) => m.role),
    };
    for (const member of members) member.send(state);
  }

  /** 監視・デバッグ用 */
  stats(): { rooms: number; peers: number } {
    let peers = 0;
    for (const members of this.rooms.values()) peers += members.size;
    return { rooms: this.rooms.size, peers };
  }
}
