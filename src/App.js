import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:5000");

function App() {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const peer = useRef(null);

  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);

  const startVideo = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.current.srcObject = stream;

    peer.current = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
      ],
    });

    stream.getTracks().forEach((track) => {
      peer.current.addTrack(track, stream);
    });

    peer.current.ontrack = (event) => {
      remoteVideo.current.srcObject = event.streams[0];
    };

    peer.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice", {
          room,
          candidate: event.candidate,
        });
      }
    };

    socket.emit("join", room);

    setJoined(true);
  };

  useEffect(() => {
    socket.on("other-user", async () => {
      const offer = await peer.current.createOffer();

      await peer.current.setLocalDescription(offer);

      socket.emit("offer", {
        room,
        offer,
      });
    });

    socket.on("offer", async (offer) => {
      await peer.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await peer.current.createAnswer();

      await peer.current.setLocalDescription(answer);

      socket.emit("answer", {
        room,
        answer,
      });
    });

    socket.on("answer", async (answer) => {
      await peer.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    socket.on("ice", async (candidate) => {
      try {
        await peer.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.log(error);
      }
    });

    return () => {
      socket.off("other-user");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice");
    };
  }, [room]);

  return (
    <div className="app">
      <h1>Video Call</h1>

      {!joined && (
        <div className="join">
          <input
            type="text"
            placeholder="Enter room ID"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />

          <button onClick={startVideo}>
            Join Call
          </button>
        </div>
      )}

      <div className="videos">
        <div>
          <p>You</p>

          <video
            ref={localVideo}
            autoPlay
            muted
            playsInline
          />
        </div>

        <div>
          <p>Other Person</p>

          <video
            ref={remoteVideo}
            autoPlay
            playsInline
          />
        </div>
      </div>
    </div>
  );
}

export default App;