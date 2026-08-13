import introVideo from '../assets/video/아이패스케어_영상.mov';

export function IntroVideoSection() {
  return (
    <section aria-label="아이패스케어 소개 영상" className="bg-white px-4 pb-20 sm:px-6 md:pb-24 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-slate-950 shadow-2xl shadow-blue-950/15 sm:rounded-3xl">
        <video
          className="block h-auto w-full"
          src={introVideo}
          loop
          playsInline
          preload="metadata"
          controls
          autoPlay
          muted
          aria-label="아이패스케어 서비스 소개 영상"
        >
          브라우저가 동영상 재생을 지원하지 않습니다.
        </video>
      </div>
    </section>
  );
}
