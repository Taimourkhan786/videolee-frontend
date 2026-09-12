import React, { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("https://videolee-backend.onrender.com");

function App() {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const peer = useRef(null);
  const localStream = useRef(null);

  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");

  // Media states
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);

  // Connection status
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | disconnected
  const [copied, setCopied] = useState(false);

  /* -----------------------------------------------------------
     START VIDEO CALL
  ----------------------------------------------------------- */
  const startVideo = async () => {
    if (!room.trim()) {
      alert("Please enter a room ID");
      return;
    }

    try {
      setStatus("connecting");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;

      createPeerConnection(stream);

      socket.emit("join", room);
      setRoomId(room);
      setJoined(true);
    } catch (err) {
      console.error("Media error:", err);
      alert("Could not access camera/microphone. Please check permissions.");
      setStatus("idle");
    }
  };

  /* -----------------------------------------------------------
     CREATE PEER CONNECTION
  ----------------------------------------------------------- */
  const createPeerConnection = (stream) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0];
        setStatus("connected");
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice", { room, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("connected");
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        setStatus("disconnected");
      }
    };

    peer.current = pc;
  };

  /* -----------------------------------------------------------
     SOCKET LISTENERS
  ----------------------------------------------------------- */
  useEffect(() => {
    socket.on("other-user", async () => {
      if (!peer.current) return;
      const offer = await peer.current.createOffer();
      await peer.current.setLocalDescription(offer);
      socket.emit("offer", { room, offer });
    });

    socket.on("offer", async (offer) => {
      if (!peer.current) return;
      await peer.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.current.createAnswer();
      await peer.current.setLocalDescription(answer);
      socket.emit("answer", { room, answer });
    });

    socket.on("answer", async (answer) => {
      if (!peer.current) return;
      await peer.current.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("ice", async (candidate) => {
      try {
        if (peer.current) {
          await peer.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.log("ICE error:", error);
      }
    });

    return () => {
      socket.off("other-user");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice");
    };
  }, [room]);

  /* -----------------------------------------------------------
     TOGGLE MIC
  ----------------------------------------------------------- */
  const toggleMic = () => {
    if (!localStream.current) return;
    localStream.current.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn(!micOn);
  };

  /* -----------------------------------------------------------
     TOGGLE CAMERA
  ----------------------------------------------------------- */
  const toggleCam = () => {
    if (!localStream.current) return;
    localStream.current.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn(!camOn);
  };

  /* -----------------------------------------------------------
     SCREEN SHARE
  ----------------------------------------------------------- */
  const toggleScreenShare = async () => {
    if (!peer.current || !localStream.current) return;

    try {
      if (!sharingScreen) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });

        const screenTrack = screenStream.getVideoTracks()[0];

        const sender = peer.current
          .getSenders()
          .find((s) => s.track && s.track.kind === "video");

        if (sender) await sender.replaceTrack(screenTrack);

        if (localVideo.current) localVideo.current.srcObject = screenStream;

        screenTrack.onended = () => stopScreenShare();
        setSharingScreen(true);
      } else {
        stopScreenShare();
      }
    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  const stopScreenShare = async () => {
    const camTrack = localStream.current.getVideoTracks()[0];
    const sender = peer.current
      ?.getSenders()
      .find((s) => s.track && s.track.kind === "video");

    if (sender && camTrack) await sender.replaceTrack(camTrack);
    if (localVideo.current) localVideo.current.srcObject = localStream.current;
    setSharingScreen(false);
  };

  /* -----------------------------------------------------------
     HANG UP / LEAVE
  ----------------------------------------------------------- */
  const leaveCall = useCallback(() => {
    if (peer.current) {
      peer.current.close();
      peer.current = null;
    }
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;

    socket.emit("leave", room);
    setJoined(false);
    setStatus("idle");
    setRoomId("");
    setRoom("");
    setMicOn(true);
    setCamOn(true);
    setSharingScreen(false);
  }, [room]);

  /* -----------------------------------------------------------
     COPY ROOM ID
  ----------------------------------------------------------- */
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  /* -----------------------------------------------------------
     UI
  ----------------------------------------------------------- */
  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <span className="logo">🎥</span> VideoCall
        </h1>
        {joined && (
          <div className={`status-badge ${status}`}>
            <span className="dot" />
            {status === "connected" && "Connected"}
            {status === "connecting" && "Connecting…"}
            {status === "disconnected" && "Disconnected"}
            {status === "idle" && "Idle"}
          </div>
        )}
      </header>

      {!joined ? (
        <div className="join">
          <input
            type="text"
            placeholder="Enter room ID…"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startVideo()}
          />
          <button onClick={startVideo}>
            <span>📞</span> Join Call
          </button>
        </div>
      ) : (
        <div className="room-bar">
          <span>
            Room: <strong>{roomId}</strong>
          </span>
          <button className="copy-btn" onClick={copyRoomId}>
            {copied ? "✅ Copied" : "📋 Copy"}
          </button>
        </div>
      )}

      <div className="videos">
        <div className="video-card local">
          <div className="video-label">
            <span>You</span>
            {!camOn && <span className="pill">Cam Off</span>}
            {!micOn && <span className="pill muted">Muted</span>}
          </div>
          <video ref={localVideo} autoPlay muted playsInline />
        </div>

        <div className="video-card remote">
          <div className="video-label">Other Person</div>
          <video ref={remoteVideo} autoPlay playsInline />
        </div>
      </div>

      {joined && (
        <div className="controls">
          <button
            className={`ctrl ${micOn ? "" : "off"}`}
            onClick={toggleMic}
            title={micOn ? "Mute" : "Unmute"}
          >
            {micOn ? "🎙️" : "🔇"}
          </button>

          <button
            className={`ctrl ${camOn ? "" : "off"}`}
            onClick={toggleCam}
            title={camOn ? "Turn Camera Off" : "Turn Camera On"}
          >
            {camOn ? "📷" : "🚫"}
          </button>

          <button
            className={`ctrl ${sharingScreen ? "active" : ""}`}
            onClick={toggleScreenShare}
            title="Share Screen"
          >
            🖥️
          </button>

          <button className="ctrl hangup" onClick={leaveCall} title="Leave Call">
            📴
          </button>
        </div>
      )}
    </div>
  );
}

export default App;