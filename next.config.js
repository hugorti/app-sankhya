module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/sankhya/:path*',
        destination: 'http://192.168.0.103:8380/mge/:path*',
      },
    ];
  },
};