<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <!-- Public, read-only radio stats. Copy into Icecast's configured webroot.
       Only this path should be allowed through Cloudflare; never /admin or
       the general /status-json.xsl endpoint. -->
  <xsl:output method="text" encoding="UTF-8" media-type="application/json" omit-xml-declaration="yes"/>
  <xsl:template match="/">
    <xsl:variable name="stream" select="/icestats/source[@mount='/stream'][1]"/>
    <xsl:text>{"live":</xsl:text>
    <xsl:choose>
      <xsl:when test="$stream">
        <xsl:text>true,"listeners":</xsl:text>
        <xsl:choose>
          <xsl:when test="$stream/listeners and number($stream/listeners) = number($stream/listeners) and number($stream/listeners) &gt;= 0">
            <xsl:value-of select="format-number(number($stream/listeners),'0')"/>
          </xsl:when>
          <xsl:otherwise><xsl:text>0</xsl:text></xsl:otherwise>
        </xsl:choose>
        <xsl:text>,"startedAt":</xsl:text>
        <xsl:choose>
          <xsl:when test="string-length(normalize-space($stream/stream_start_iso8601)) &gt; 0">
            <xsl:text>"</xsl:text><xsl:value-of select="normalize-space($stream/stream_start_iso8601)"/><xsl:text>"</xsl:text>
          </xsl:when>
          <xsl:otherwise><xsl:text>null</xsl:text></xsl:otherwise>
        </xsl:choose>
      </xsl:when>
      <xsl:otherwise><xsl:text>false,"listeners":0,"startedAt":null</xsl:text></xsl:otherwise>
    </xsl:choose>
    <xsl:text>}</xsl:text>
  </xsl:template>
</xsl:stylesheet>
